import type { JsonObject } from 'n8n-workflow';

export interface LagoErrorDescription {
	/** Short statement of what went wrong, shown as the error title. */
	message: string;
	/** How to fix it, shown underneath. */
	description: string;
}

interface ErrorLike {
	statusCode?: number;
	httpCode?: number | string;
	code?: string;
	message?: string;
	response?: { status?: number; body?: unknown; data?: unknown; headers?: unknown };
	body?: unknown;
	cause?: unknown;
}

function statusOf(error: ErrorLike): number | undefined {
	const raw = error.statusCode ?? error.response?.status ?? error.httpCode;
	const parsed = typeof raw === 'string' ? Number.parseInt(raw, 10) : raw;
	return Number.isFinite(parsed) ? (parsed as number) : undefined;
}

function bodyOf(error: ErrorLike): unknown {
	return error.response?.body ?? error.response?.data ?? error.body;
}

function asObject(body: unknown): JsonObject | undefined {
	if (typeof body === 'string') {
		const trimmed = body.trim();
		if (!trimmed || trimmed.startsWith('<')) return undefined;
		try {
			return asObject(JSON.parse(trimmed));
		} catch {
			return undefined;
		}
	}
	return body && typeof body === 'object' ? (body as JsonObject) : undefined;
}

/**
 * Flattens Lago's validation payload into one line.
 *
 * A 422 carries `error_details` shaped `{ field: ["problem", ...] }`, and those messages are the
 * only part of a Lago error that names the offending field. Losing them turns an actionable
 * failure into "422 Unprocessable Entity".
 */
export function lagoValidationMessage(body: unknown): string | undefined {
	const details = asObject(body)?.error_details;
	if (!details || typeof details !== 'object') return undefined;

	const parts: string[] = [];
	for (const [field, problems] of Object.entries(details as JsonObject)) {
		const list = Array.isArray(problems) ? problems : [problems];
		const text = list.filter((entry) => typeof entry === 'string').join(', ');
		if (text) parts.push(`${field}: ${text}`);
	}

	return parts.length ? parts.join('; ') : undefined;
}

/**
 * Pulls the server's own wording out of a Lago error body.
 *
 * Lago uses three shapes rather than one. A 401 is `{status, error}` with no code; a 404 adds a
 * `code` such as `customer_not_found`; and a request missing its top-level wrapper key answers
 * 400 with the explanation inlined into `error` — `"BadRequest: param is missing or the value is
 * empty or invalid: customer"` — with no code at all.
 */
export function lagoServerMessage(body: unknown): string | undefined {
	const parsed = asObject(body);
	if (!parsed) return undefined;

	const validation = lagoValidationMessage(parsed);
	if (validation) return validation;

	if (typeof parsed.message === 'string' && parsed.message.trim()) return parsed.message;

	if (typeof parsed.error === 'string' && parsed.error.trim()) {
		// A 400 inlines the useful half after "BadRequest: ". Bare status words like
		// "Unauthorized" or "Not Found" add nothing a caller does not already know.
		const inlined = /^BadRequest:\s*(.+)$/i.exec(parsed.error);
		if (inlined) return inlined[1];
		if (!/^(unauthorized|not found|forbidden|unprocessable entity)$/i.test(parsed.error.trim())) {
			return parsed.error;
		}
	}

	return undefined;
}

/** Lago's own error code, such as `customer_not_found` or `validation_errors`. */
function lagoCode(body: unknown): string | undefined {
	const code = asObject(body)?.code;
	return typeof code === 'string' ? code : undefined;
}

/** Seconds until the rate-limit window resets, when the response says so. */
function rateLimitReset(error: ErrorLike): string | undefined {
	const headers = error.response?.headers;
	if (!headers || typeof headers !== 'object') return undefined;
	const value = (headers as Record<string, unknown>)['x-ratelimit-reset'];
	return value === undefined || value === null ? undefined : String(value);
}

/** True when the response is HTML, which means the URL is not a Lago API. */
function looksLikeHtml(body: unknown): boolean {
	return typeof body === 'string' && /^\s*<(?:!doctype|html)/i.test(body);
}

/**
 * Turns whatever the HTTP layer threw into something a workflow author can act on.
 *
 * Lago's own wording is preserved wherever there is any, because it is consistently more
 * specific than anything invented here — a validation failure names the field, and a 404 names
 * the object type. The failures worth telling apart are a rejected key, a missing resource, a
 * validation failure, rate limiting, and simply not reaching the server, because each needs a
 * different fix and a bare status code indicates none of them.
 */
export function describeLagoError(
	error: unknown,
	context: { resource?: string; resourceId?: string; baseUrl?: string } = {},
): LagoErrorDescription {
	const err = (error ?? {}) as ErrorLike;
	const status = statusOf(err);
	const body = bodyOf(err);
	const serverMessage = lagoServerMessage(body);
	const code = lagoCode(body);
	const subject = context.resource ?? 'resource';

	if (looksLikeHtml(body)) {
		return {
			message: 'The server responded with a web page instead of API data',
			description:
				'The Base URL is reachable but does not appear to be a Lago API. It often points at the Lago front-end rather than the API, which are different ports on a self-hosted install. Check the Base URL in your credential.',
		};
	}

	const networkCode = err.code ?? (err.cause as ErrorLike | undefined)?.code;
	if (status === undefined && networkCode) {
		const target = context.baseUrl ? ` at ${context.baseUrl}` : '';
		if (networkCode === 'ENOTFOUND' || networkCode === 'EAI_AGAIN') {
			return {
				message: `Could not resolve the Lago server${target}`,
				description:
					'The host name in the Base URL does not resolve. Check the credential for a typo, and that the host is reachable from this n8n instance.',
			};
		}
		if (networkCode === 'ECONNREFUSED') {
			return {
				message: `Could not connect to the Lago server${target}`,
				description:
					'The host resolved but refused the connection. Check that Lago is running and that the port in the Base URL is correct — the API and the front-end listen on different ports.',
			};
		}
		if (networkCode === 'ETIMEDOUT' || networkCode === 'ECONNRESET') {
			return {
				message: `The connection to the Lago server${target} timed out`,
				description:
					'The server did not respond in time. It may be overloaded, or a firewall may be dropping the connection.',
			};
		}
		if (networkCode.startsWith?.('CERT_') || networkCode.startsWith?.('UNABLE_TO_VERIFY')) {
			return {
				message: 'The Lago server presented an invalid TLS certificate',
				description:
					'The certificate could not be verified. Use a valid certificate, or connect over http:// for a local development server.',
			};
		}
		return {
			message: `Could not reach the Lago server${target}`,
			description: `The request failed before the server responded (${networkCode}).`,
		};
	}

	switch (status) {
		case 401:
		case 403:
			return {
				message: 'Lago rejected the API key',
				description:
					'Check the API Key in the credential, found in the Lago app under Developers > API keys. Also check the Base URL points at the same Lago instance the key belongs to.',
			};
		case 404:
			return {
				message: context.resourceId
					? `${subject} ${context.resourceId} was not found`
					: `The requested ${subject} was not found`,
				description:
					serverMessage ??
					(code
						? `Lago reported ${code}. It may have been deleted, or the identifier may belong to a different Lago instance.`
						: 'It may have been deleted, or the identifier may belong to a different Lago instance.'),
			};
		case 400:
		case 422:
			return {
				message: serverMessage ?? `Lago rejected the ${subject} data as invalid`,
				description: 'Check the field values sent with this operation.',
			};
		case 405:
			return {
				message: serverMessage ?? `Lago does not allow this operation on ${subject}`,
				description:
					'Some Lago endpoints require a premium licence, and some operations do not exist for this resource. Check the operation against your Lago plan.',
			};
		case 429: {
			const reset = rateLimitReset(err);
			return {
				message: 'Lago is rate limiting this connection',
				description: reset
					? `Rate limits apply per organization, so every API key shares one budget. Retry in ${reset}s.`
					: 'Rate limits apply per organization, so every API key shares one budget. Retry after a short delay.',
			};
		}
		default:
			break;
	}

	if (status !== undefined && status >= 500) {
		return {
			message: serverMessage ?? `The Lago server failed with status ${status}`,
			description: 'This is an error inside Lago rather than in the request. Check its logs.',
		};
	}

	return {
		message: serverMessage ?? err.message ?? 'The request to Lago failed',
		description:
			status === undefined ? 'No response was received.' : `Lago responded with status ${status}.`,
	};
}
