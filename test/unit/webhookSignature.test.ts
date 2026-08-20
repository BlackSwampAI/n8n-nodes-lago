import { createHmac, createSign, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
	expectedJwtIssuer,
	toPublicKeyPem,
	verifyHmacSignature,
	verifyJwtSignature,
	verifyLagoWebhookSignature,
} from '../../nodes/Lago/shared/webhookSignature';

const ISSUER = 'https://api.getlago.com';
const HMAC_KEY = 'organization-hmac-key';

/** A realistic Lago webhook body — verification runs over these exact bytes. */
const BODY = Buffer.from(
	JSON.stringify({
		webhook_type: 'invoice.created',
		object_type: 'invoice',
		invoice: { lago_id: '1a901a90-1a90-1a90-1a90-1a901a901a90', total_amount_cents: 1000 },
	}),
	'utf8',
);

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

const base64url = (input: Buffer | string) => Buffer.from(input).toString('base64url');

/** Builds a signed RS256 JWT the way Lago does, with the body in the `data` claim. */
function signJwt(payload: Record<string, unknown>, alg = 'RS256'): string {
	const header = base64url(JSON.stringify({ alg, typ: 'JWT' }));
	const body = base64url(JSON.stringify(payload));
	const signature = createSign('RSA-SHA256').update(`${header}.${body}`).sign(privateKey);
	return `${header}.${body}.${base64url(signature)}`;
}

function lagoJwt(overrides: Record<string, unknown> = {}, alg?: string): string {
	return signJwt({ iss: ISSUER, data: BODY.toString('utf8'), ...overrides }, alg);
}

function lagoHmac(body: Buffer = BODY, key = HMAC_KEY): string {
	return createHmac('sha256', key).update(body).digest('base64');
}

describe('expectedJwtIssuer', () => {
	it('returns the cloud API root unchanged', () => {
		expect(expectedJwtIssuer('https://api.getlago.com')).toBe('https://api.getlago.com');
	});

	it('strips a trailing slash', () => {
		expect(expectedJwtIssuer('https://api.getlago.com/')).toBe('https://api.getlago.com');
	});

	it('strips an /api/v1 suffix so a pasted API root still resolves', () => {
		expect(expectedJwtIssuer('https://api.getlago.com/api/v1')).toBe('https://api.getlago.com');
		expect(expectedJwtIssuer('https://api.getlago.com/api/v1/')).toBe('https://api.getlago.com');
	});

	it('derives a self-hosted issuer rather than assuming the cloud one', () => {
		expect(expectedJwtIssuer('https://billing.acme.com/api/v1')).toBe('https://billing.acme.com');
	});

	it('rejects an empty base URL', () => {
		expect(() => expectedJwtIssuer('   ')).toThrow(/base URL is required/i);
	});
});

describe('toPublicKeyPem', () => {
	it('passes a raw PEM through', () => {
		expect(toPublicKeyPem(publicKeyPem)).toBe(publicKeyPem.trim());
	});

	it('decodes a base64-wrapped PEM, as the Ruby client expects', () => {
		expect(toPublicKeyPem(Buffer.from(publicKeyPem).toString('base64'))).toBe(publicKeyPem.trim());
	});

	it('rejects an empty key', () => {
		expect(() => toPublicKeyPem('  ')).toThrow(/empty/i);
	});

	it('rejects a value that is neither PEM nor base64 PEM', () => {
		expect(() => toPublicKeyPem('not-a-key')).toThrow(/neither a PEM/i);
	});
});

describe('verifyHmacSignature', () => {
	it('accepts a correctly signed body', () => {
		expect(verifyHmacSignature(BODY, lagoHmac(), HMAC_KEY)).toBe(true);
	});

	it('rejects a tampered body', () => {
		const tampered = Buffer.from(BODY.toString('utf8').replace('1000', '9999'), 'utf8');
		expect(verifyHmacSignature(tampered, lagoHmac(), HMAC_KEY)).toBe(false);
	});

	it('rejects a signature made with a different key', () => {
		expect(verifyHmacSignature(BODY, lagoHmac(BODY, 'wrong-key'), HMAC_KEY)).toBe(false);
	});

	it('rejects an empty signature', () => {
		expect(verifyHmacSignature(BODY, '', HMAC_KEY)).toBe(false);
	});

	it('rejects a truncated signature without throwing on the length mismatch', () => {
		expect(verifyHmacSignature(BODY, lagoHmac().slice(0, 20), HMAC_KEY)).toBe(false);
	});

	it('throws when the node is misconfigured with no key', () => {
		expect(() => verifyHmacSignature(BODY, lagoHmac(), '')).toThrow(/HMAC key is required/i);
	});
});

describe('verifyJwtSignature', () => {
	it('accepts a correctly signed webhook', () => {
		expect(verifyJwtSignature(BODY, lagoJwt(), publicKeyPem, ISSUER)).toBe(true);
	});

	it('accepts a base64-wrapped public key', () => {
		const wrapped = Buffer.from(publicKeyPem).toString('base64');
		expect(verifyJwtSignature(BODY, lagoJwt(), wrapped, ISSUER)).toBe(true);
	});

	it('rejects a valid token replayed against a different body', () => {
		const otherBody = Buffer.from(JSON.stringify({ webhook_type: 'invoice.voided' }), 'utf8');
		expect(verifyJwtSignature(otherBody, lagoJwt(), publicKeyPem, ISSUER)).toBe(false);
	});

	it('rejects a token signed by a different key', () => {
		const foreign = generateKeyPairSync('rsa', { modulusLength: 2048 });
		const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
		const body = base64url(JSON.stringify({ iss: ISSUER, data: BODY.toString('utf8') }));
		const signature = createSign('RSA-SHA256').update(`${header}.${body}`).sign(foreign.privateKey);
		const token = `${header}.${body}.${base64url(signature)}`;

		expect(verifyJwtSignature(BODY, token, publicKeyPem, ISSUER)).toBe(false);
	});

	it('rejects a mismatched issuer, which is how a self-hosted misconfiguration surfaces', () => {
		expect(verifyJwtSignature(BODY, lagoJwt(), publicKeyPem, 'https://billing.acme.com')).toBe(
			false,
		);
	});

	it('rejects the `none` algorithm', () => {
		const header = base64url(JSON.stringify({ alg: 'none', typ: 'JWT' }));
		const body = base64url(JSON.stringify({ iss: ISSUER, data: BODY.toString('utf8') }));
		expect(verifyJwtSignature(BODY, `${header}.${body}.`, publicKeyPem, ISSUER)).toBe(false);
	});

	it('rejects an HMAC-family algorithm signed with the public key as the secret', () => {
		const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
		const body = base64url(JSON.stringify({ iss: ISSUER, data: BODY.toString('utf8') }));
		const forged = createHmac('sha256', publicKeyPem).update(`${header}.${body}`).digest();
		expect(
			verifyJwtSignature(BODY, `${header}.${body}.${base64url(forged)}`, publicKeyPem, ISSUER),
		).toBe(false);
	});

	it('rejects a token whose algorithm header disagrees with how it was signed', () => {
		expect(verifyJwtSignature(BODY, lagoJwt({}, 'RS512'), publicKeyPem, ISSUER)).toBe(false);
	});

	it('rejects an expired token', () => {
		const token = lagoJwt({ exp: 1_000 });
		expect(verifyJwtSignature(BODY, token, publicKeyPem, ISSUER, 2_000)).toBe(false);
	});

	it('accepts a token that has not yet expired', () => {
		const token = lagoJwt({ exp: 2_000 });
		expect(verifyJwtSignature(BODY, token, publicKeyPem, ISSUER, 1_000)).toBe(true);
	});

	it('rejects a token that is not yet valid', () => {
		const token = lagoJwt({ nbf: 2_000 });
		expect(verifyJwtSignature(BODY, token, publicKeyPem, ISSUER, 1_000)).toBe(false);
	});

	it('rejects a token with a missing data claim', () => {
		const token = signJwt({ iss: ISSUER });
		expect(verifyJwtSignature(BODY, token, publicKeyPem, ISSUER)).toBe(false);
	});

	it.each([
		['empty', ''],
		['not a JWT', 'garbage'],
		['too few segments', 'a.b'],
		['too many segments', 'a.b.c.d'],
		['non-base64 segments', '!!!.!!!.!!!'],
		['empty segments', '..'],
	])('rejects a malformed token (%s) without throwing', (_label, token) => {
		expect(verifyJwtSignature(BODY, token, publicKeyPem, ISSUER)).toBe(false);
	});
});

describe('verifyLagoWebhookSignature', () => {
	it('dispatches to JWT verification', () => {
		expect(
			verifyLagoWebhookSignature({
				rawBody: BODY,
				signature: lagoJwt(),
				algorithm: 'jwt',
				publicKey: publicKeyPem,
				issuer: ISSUER,
			}),
		).toBe(true);
	});

	it('dispatches to HMAC verification', () => {
		expect(
			verifyLagoWebhookSignature({
				rawBody: BODY,
				signature: lagoHmac(),
				algorithm: 'hmac',
				hmacKey: HMAC_KEY,
			}),
		).toBe(true);
	});

	it('throws — rather than silently rejecting — when jwt config is missing', () => {
		expect(() =>
			verifyLagoWebhookSignature({ rawBody: BODY, signature: lagoJwt(), algorithm: 'jwt' }),
		).toThrow(/public key is required/i);

		expect(() =>
			verifyLagoWebhookSignature({
				rawBody: BODY,
				signature: lagoJwt(),
				algorithm: 'jwt',
				publicKey: publicKeyPem,
			}),
		).toThrow(/issuer is required/i);
	});

	it('throws when hmac config is missing', () => {
		expect(() =>
			verifyLagoWebhookSignature({ rawBody: BODY, signature: lagoHmac(), algorithm: 'hmac' }),
		).toThrow(/HMAC key is required/i);
	});
});
