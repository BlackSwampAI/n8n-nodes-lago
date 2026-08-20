import { describe, expect, it } from 'vitest';
import { LagoApi } from '../../credentials/LagoApi.credentials';
import { hasLago, lagoApiKey, lagoBaseUrl } from '../support/env.mjs';

// Skips rather than fails when no Lago is configured, so the suite still runs for contributors
// without Docker. Start one with: npm run lago:up
const describeLago = hasLago ? describe : describe.skip;

const baseUrl = String(lagoBaseUrl ?? '').replace(/\/+$/, '');

// Note the null rather than undefined: an explicit `undefined` argument would re-trigger the
// default parameter and silently send the real key.
async function get(path: string, key: string | null = lagoApiKey ?? null) {
	return fetch(`${baseUrl}${path}`, {
		headers: key ? { Authorization: `Bearer ${key}` } : {},
	});
}

describeLago('LagoApi credential against a live Lago instance', () => {
	const credentialTest = new LagoApi().test.request;

	// Drives the request straight from the credential definition, so the credential cannot
	// drift away from a route that actually works.
	it('succeeds against the route the credential test actually probes', async () => {
		const response = await get(String(credentialTest.url));
		expect(response.status).toBe(200);
	});

	it('proves the probe route reaches a seeded organization, not just a running server', async () => {
		const response = await get('/api/v1/billing_entities');
		const body = await response.json();
		expect(Array.isArray(body.billing_entities)).toBe(true);
		expect(body.billing_entities.length).toBeGreaterThan(0);
	});

	it('rejects an invalid key with 401 rather than a network error', async () => {
		const response = await get('/api/v1/customers', 'definitely-not-a-real-key');
		expect(response.status).toBe(401);
	});

	it('rejects a missing key with 401', async () => {
		const response = await get('/api/v1/customers', null);
		expect(response.status).toBe(401);
	});

	it('returns the documented 401 body shape, which carries no error code', async () => {
		const response = await get('/api/v1/customers', 'definitely-not-a-real-key');
		expect(await response.json()).toEqual({ status: 401, error: 'Unauthorized' });
	});

	// Justifies stripping a trailing /api/v1 in the shared base-URL expression: without it, a
	// base URL given in that spelling produces this path, and every request 404s.
	it('does not route a doubled /api/v1 segment', async () => {
		const response = await get('/api/v1/api/v1/customers');
		expect(response.status).not.toBe(200);
	});
});
