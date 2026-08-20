import { describe, expect, it } from 'vitest';
import {
	describeLagoError,
	lagoServerMessage,
	lagoValidationMessage,
} from '../../nodes/Lago/shared/errors';

/** Shapes an error the way n8n's HTTP helper surfaces one. */
function httpError(status: number, body: unknown, headers?: Record<string, unknown>) {
	return { statusCode: status, response: { status, body, headers } };
}

describe('lagoValidationMessage', () => {
	// Captured from a live Lago instance.
	it('flattens error_details, naming the offending field', () => {
		const body = {
			status: 422,
			error: 'Unprocessable Entity',
			code: 'validation_errors',
			error_details: { event_types: ['contains invalid types: ["invoice_created"]'] },
		};
		expect(lagoValidationMessage(body)).toBe(
			'event_types: contains invalid types: ["invoice_created"]',
		);
	});

	it('joins several fields and several problems per field', () => {
		const body = { error_details: { name: ['is required', 'is too short'], code: ['is taken'] } };
		expect(lagoValidationMessage(body)).toBe('name: is required, is too short; code: is taken');
	});

	it('returns undefined when there are no details', () => {
		expect(lagoValidationMessage({ status: 401, error: 'Unauthorized' })).toBeUndefined();
		expect(lagoValidationMessage('not json')).toBeUndefined();
		expect(lagoValidationMessage(undefined)).toBeUndefined();
	});
});

describe('lagoServerMessage', () => {
	// The 400 shape carries no code and inlines the explanation into `error`.
	it('unwraps the explanation from a BadRequest', () => {
		const body = {
			status: 400,
			error: 'BadRequest: param is missing or the value is empty or invalid: customer',
		};
		expect(lagoServerMessage(body)).toBe(
			'param is missing or the value is empty or invalid: customer',
		);
	});

	it('ignores bare status words that tell the caller nothing', () => {
		expect(lagoServerMessage({ status: 401, error: 'Unauthorized' })).toBeUndefined();
		expect(lagoServerMessage({ status: 404, error: 'Not Found', code: 'x' })).toBeUndefined();
	});

	it('prefers validation details over anything else', () => {
		const body = {
			error: 'Unprocessable Entity',
			error_details: { currency: ['is not supported'] },
		};
		expect(lagoServerMessage(body)).toBe('currency: is not supported');
	});

	it('parses a JSON string body', () => {
		expect(lagoServerMessage('{"error":"BadRequest: nope"}')).toBe('nope');
	});

	it('ignores an HTML body', () => {
		expect(lagoServerMessage('<!doctype html><html></html>')).toBeUndefined();
	});
});

describe('describeLagoError', () => {
	it('names the credential for a rejected key', () => {
		const described = describeLagoError(httpError(401, { status: 401, error: 'Unauthorized' }));
		expect(described.message).toBe('Lago rejected the API key');
		expect(described.description).toMatch(/Developers > API keys/);
	});

	it('names the resource and identifier on a 404', () => {
		const described = describeLagoError(
			httpError(404, { status: 404, error: 'Not Found', code: 'customer_not_found' }),
			{ resource: 'Customer', resourceId: 'acme' },
		);
		expect(described.message).toBe('Customer acme was not found');
		expect(described.description).toMatch(/customer_not_found/);
	});

	it("surfaces Lago's validation wording as the headline", () => {
		const described = describeLagoError(
			httpError(422, {
				status: 422,
				code: 'validation_errors',
				error_details: { external_id: ['value is already used'] },
			}),
			{ resource: 'Customer' },
		);
		expect(described.message).toBe('external_id: value is already used');
	});

	it('surfaces the inlined explanation of a 400', () => {
		const described = describeLagoError(
			httpError(400, {
				status: 400,
				error: 'BadRequest: param is missing or the value is empty or invalid: customer',
			}),
		);
		expect(described.message).toBe('param is missing or the value is empty or invalid: customer');
	});

	it('explains that 405 may mean a premium licence', () => {
		const described = describeLagoError(httpError(405, {}), { resource: 'Subscription' });
		expect(described.description).toMatch(/premium/i);
	});

	it('reports the rate-limit reset when Lago sends one', () => {
		const described = describeLagoError(httpError(429, {}, { 'x-ratelimit-reset': '12' }));
		expect(described.message).toBe('Lago is rate limiting this connection');
		expect(described.description).toMatch(/Retry in 12s/);
	});

	it('falls back gracefully when the rate-limit header is absent', () => {
		const described = describeLagoError(httpError(429, {}));
		expect(described.description).toMatch(/short delay/);
	});

	it('recognises the front-end being mistaken for the API', () => {
		const described = describeLagoError(httpError(200, '<!doctype html><html></html>'));
		expect(described.message).toMatch(/web page instead of API data/);
		expect(described.description).toMatch(/front-end/);
	});

	it.each([
		['ENOTFOUND', /Could not resolve/],
		['ECONNREFUSED', /Could not connect/],
		['ETIMEDOUT', /timed out/],
		['CERT_HAS_EXPIRED', /TLS certificate/],
	])('explains the network failure %s', (code, expected) => {
		const described = describeLagoError({ code }, { baseUrl: 'https://lago.test' });
		expect(described.message).toMatch(expected);
	});

	it('mentions the port confusion that self-hosted users hit', () => {
		const described = describeLagoError({ code: 'ECONNREFUSED' });
		expect(described.description).toMatch(/different ports/);
	});

	it('blames Lago, not the request, on a 5xx', () => {
		const described = describeLagoError(httpError(500, {}));
		expect(described.description).toMatch(/inside Lago/);
	});

	it('never throws on junk input', () => {
		expect(() => describeLagoError(undefined)).not.toThrow();
		expect(() => describeLagoError(null)).not.toThrow();
		expect(() => describeLagoError('boom')).not.toThrow();
		expect(describeLagoError({}).message).toBe('The request to Lago failed');
	});
});
