import { createHmac, createVerify, timingSafeEqual } from 'node:crypto';

/**
 * Signature algorithms Lago can be configured to use for a webhook endpoint.
 *
 * `jwt` is Lago's default and is preferred here: the verification key is
 * retrievable from `GET /webhooks/public_key` with the same API key the
 * credential already holds, so it needs no extra configuration. `hmac` relies
 * on an organization-level key that the REST API does not expose, so the user
 * has to copy it out of the Lago dashboard by hand.
 */
export type LagoSignatureAlgorithm = 'jwt' | 'hmac';

/** The only JWT algorithm Lago signs with. Anything else is rejected outright. */
const JWT_ALGORITHM = 'RS256';

/** Header carrying the signature itself. */
export const SIGNATURE_HEADER = 'x-lago-signature';
/** Header naming the algorithm used, `jwt` or `hmac`. */
export const SIGNATURE_ALGORITHM_HEADER = 'x-lago-signature-algorithm';
/** Header carrying a UUID that is stable across Lago's delivery retries. */
export const UNIQUE_KEY_HEADER = 'x-lago-unique-key';

/**
 * Constant-time buffer comparison that tolerates differing lengths.
 *
 * `timingSafeEqual` throws when the two buffers differ in length, and the
 * length itself is not a secret, so compare it first and fall through to the
 * constant-time path only when it matches.
 */
function safeEqual(a: Buffer, b: Buffer): boolean {
	if (a.length !== b.length) return false;
	return timingSafeEqual(a, b);
}

/**
 * Normalises whatever `GET /webhooks/public_key` returned into a PEM string.
 *
 * Lago's own clients disagree here — the Ruby example base64-decodes the
 * response before use while the Python one passes it straight through — so
 * accept both a raw PEM and a base64-wrapped PEM.
 *
 * @throws if the value is neither.
 */
export function toPublicKeyPem(publicKey: string): string {
	const trimmed = publicKey.trim();
	if (trimmed.length === 0) {
		throw new Error('Lago webhook public key is empty');
	}
	if (trimmed.includes('-----BEGIN')) {
		return trimmed;
	}

	const decoded = Buffer.from(trimmed, 'base64').toString('utf8').trim();
	if (!decoded.includes('-----BEGIN')) {
		throw new Error('Lago webhook public key is neither a PEM nor a base64-encoded PEM');
	}
	return decoded;
}

/**
 * Derives the JWT `iss` claim to expect from the credential's base URL.
 *
 * Lago issues webhook JWTs with its own API root as the issuer. That is
 * `https://api.getlago.com` on cloud, but a self-hosted instance issues its own
 * `LAGO_API_URL`, so hardcoding the cloud value would reject every self-hosted
 * delivery. The `/api/v1` suffix is not part of the issuer, so strip it if the
 * user pasted the full API root.
 */
export function expectedJwtIssuer(baseUrl: string): string {
	const trimmed = baseUrl.trim().replace(/\/+$/, '');
	if (trimmed.length === 0) {
		throw new Error('Lago base URL is required to derive the expected webhook issuer');
	}
	return trimmed.replace(/\/api\/v\d+$/, '');
}

/**
 * Verifies an `hmac` webhook signature.
 *
 * Lago computes `base64(HMAC-SHA256(rawBody, organizationHmacKey))`.
 */
export function verifyHmacSignature(rawBody: Buffer, signature: string, hmacKey: string): boolean {
	if (hmacKey.length === 0) {
		throw new Error('Lago organization HMAC key is required to verify this webhook');
	}
	if (signature.length === 0) return false;

	const expected = createHmac('sha256', hmacKey).update(rawBody).digest();
	let received: Buffer;
	try {
		received = Buffer.from(signature, 'base64');
	} catch {
		return false;
	}

	return safeEqual(expected, received);
}

type JwtSegments = {
	header: { alg?: unknown };
	payload: { iss?: unknown; data?: unknown; exp?: unknown; nbf?: unknown };
	signingInput: string;
	signature: Buffer;
};

/** Splits and decodes a compact JWT, returning `undefined` for anything malformed. */
function decodeJwt(token: string): JwtSegments | undefined {
	const parts = token.split('.');
	if (parts.length !== 3) return undefined;

	const [encodedHeader, encodedPayload, encodedSignature] = parts;
	if (!encodedHeader || !encodedPayload || !encodedSignature) return undefined;

	try {
		const header: unknown = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf8'));
		const payload: unknown = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
		if (typeof header !== 'object' || header === null) return undefined;
		if (typeof payload !== 'object' || payload === null) return undefined;

		return {
			header: header as JwtSegments['header'],
			payload: payload as JwtSegments['payload'],
			signingInput: `${encodedHeader}.${encodedPayload}`,
			signature: Buffer.from(encodedSignature, 'base64url'),
		};
	} catch {
		return undefined;
	}
}

/**
 * Verifies a `jwt` webhook signature.
 *
 * Checks, in order: the token is well formed, its algorithm is RS256, the RSA
 * signature is valid for the given public key, the issuer matches the instance
 * the credential points at, any `exp`/`nbf` claims are currently valid, and the
 * `data` claim equals the raw request body.
 *
 * The `data` check is what binds the signature to this specific payload — a
 * valid token replayed against a different body must not pass.
 *
 * @param now - injectable clock, in seconds since the epoch, for testing.
 */
export function verifyJwtSignature(
	rawBody: Buffer,
	signature: string,
	publicKey: string,
	issuer: string,
	now: number = Math.floor(Date.now() / 1000),
): boolean {
	const pem = toPublicKeyPem(publicKey);
	if (signature.length === 0) return false;

	const decoded = decodeJwt(signature);
	if (decoded === undefined) return false;

	// Reject algorithm confusion, including `none` and any HMAC-family algorithm
	// that would otherwise be verified against the public key as a shared secret.
	if (decoded.header.alg !== JWT_ALGORITHM) return false;

	let signatureValid: boolean;
	try {
		signatureValid = createVerify('RSA-SHA256')
			.update(decoded.signingInput)
			.verify(pem, decoded.signature);
	} catch {
		return false;
	}
	if (!signatureValid) return false;

	if (decoded.payload.iss !== issuer) return false;

	const { exp, nbf } = decoded.payload;
	if (typeof exp === 'number' && now >= exp) return false;
	if (typeof nbf === 'number' && now < nbf) return false;

	if (typeof decoded.payload.data !== 'string') return false;
	return safeEqual(Buffer.from(decoded.payload.data, 'utf8'), rawBody);
}

export type VerifyWebhookOptions = {
	/** The exact bytes n8n received, via `req.readRawBody()` — never the re-serialised JSON. */
	rawBody: Buffer;
	/** Value of the `X-Lago-Signature` header. */
	signature: string;
	/** Which algorithm the endpoint is configured for. */
	algorithm: LagoSignatureAlgorithm;
	/** PEM or base64-wrapped PEM from `GET /webhooks/public_key`. Required for `jwt`. */
	publicKey?: string;
	/** Expected `iss` claim, from {@link expectedJwtIssuer}. Required for `jwt`. */
	issuer?: string;
	/** Organization HMAC key from the Lago dashboard. Required for `hmac`. */
	hmacKey?: string;
	/** Injectable clock for testing. */
	now?: number;
};

/**
 * Verifies a Lago webhook signature with either supported algorithm.
 *
 * Returns `false` for anything an attacker controls (bad signature, tampered
 * body, wrong issuer, malformed token) and throws only when the node itself is
 * misconfigured, so callers can distinguish "reject this delivery" from "this
 * credential is set up wrong".
 */
export function verifyLagoWebhookSignature(options: VerifyWebhookOptions): boolean {
	const { rawBody, signature, algorithm } = options;

	if (algorithm === 'hmac') {
		if (options.hmacKey === undefined) {
			throw new Error('Lago organization HMAC key is required to verify this webhook');
		}
		return verifyHmacSignature(rawBody, signature, options.hmacKey);
	}

	if (options.publicKey === undefined) {
		throw new Error('Lago webhook public key is required to verify this webhook');
	}
	if (options.issuer === undefined) {
		throw new Error('Expected Lago webhook issuer is required to verify this webhook');
	}
	return verifyJwtSignature(rawBody, signature, options.publicKey, options.issuer, options.now);
}
