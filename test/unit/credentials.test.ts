import { describe, expect, it } from 'vitest';
import { LagoApi } from '../../credentials/LagoApi.credentials';

const credential = new LagoApi();

/**
 * Evaluates the base-URL expression the credential and node share, the way n8n would.
 *
 * The expression is a string in the source, so nothing typechecks it and a broken regex would
 * only surface as 404s at runtime. Reproducing the transform here keeps it honest.
 */
function resolveBaseUrl(baseUrl: string): string {
	return baseUrl.replace(/\/+$/, '').replace(/\/api\/v1$/, '');
}

describe('LagoApi credential', () => {
	it('authenticates with a bearer token', () => {
		expect(credential.authenticate.properties.headers?.Authorization).toBe(
			'=Bearer {{ $credentials.apiKey }}',
		);
	});

	it('keeps the API key out of anything but a password field', () => {
		const apiKey = credential.properties.find((property) => property.name === 'apiKey');
		expect(apiKey?.typeOptions?.password).toBe(true);
	});

	it('defaults the base URL to Lago Cloud but leaves it editable for self-hosting', () => {
		const baseUrl = credential.properties.find((property) => property.name === 'baseUrl');
		expect(baseUrl?.default).toBe('https://api.getlago.com');
		expect(baseUrl?.required).toBe(true);
	});

	it('probes a route that exists under /api/v1', () => {
		expect(credential.test.request.url).toBe('/api/v1/billing_entities');
		expect(credential.test.request.method).toBe('GET');
	});

	// Lago documents the host root, but its own examples and self-hosted deployments use both
	// spellings. Without the /api/v1 strip, one of them produces /api/v1/api/v1 and every
	// request 404s.
	it.each([
		['https://api.getlago.com', 'https://api.getlago.com'],
		['https://api.getlago.com/', 'https://api.getlago.com'],
		['https://api.getlago.com/api/v1', 'https://api.getlago.com'],
		['https://api.getlago.com/api/v1/', 'https://api.getlago.com'],
		['https://billing.acme.com', 'https://billing.acme.com'],
		['http://localhost:3210/api/v1/', 'http://localhost:3210'],
	])('normalises %s', (input, expected) => {
		expect(resolveBaseUrl(input)).toBe(expected);
	});

	it('uses that same normalisation in the credential test', () => {
		expect(credential.test.request.baseURL).toBe(
			'={{ $credentials.baseUrl.replace(/\\/+$/, "").replace(/\\/api\\/v1$/, "") }}',
		);
	});
});
