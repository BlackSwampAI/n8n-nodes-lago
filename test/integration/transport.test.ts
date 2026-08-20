import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { collectAll, extractPage, normalizeBaseUrl } from '../../nodes/Lago/shared/transport';
import { describeLagoError } from '../../nodes/Lago/shared/errors';
import { hasLago, lagoApiKey, lagoBaseUrl } from '../support/env.mjs';

const describeLago = hasLago ? describe : describe.skip;

const root = hasLago ? normalizeBaseUrl(String(lagoBaseUrl)) : '';
const api = `${root}/api/v1`;

// Run-scoped so repeated runs, and parallel runs against a shared instance, cannot collide on
// Lago's unique external_id constraint.
const runId = `t${Date.now().toString(36)}`;
const externalIds = [1, 2, 3, 4, 5].map((n) => `${runId}-customer-${n}`);

async function call(path: string, init: RequestInit = {}) {
	const response = await fetch(`${api}${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${lagoApiKey}`,
			'Content-Type': 'application/json',
			...(init.headers ?? {}),
		},
	});
	const text = await response.text();
	let body: unknown;
	try {
		body = JSON.parse(text);
	} catch {
		body = text;
	}
	return { status: response.status, body };
}

/** Shapes a real response the way n8n's HTTP helper surfaces a failure. */
function asHttpError(result: { status: number; body: unknown }) {
	return { statusCode: result.status, response: { status: result.status, body: result.body } };
}

describeLago('transport against a live Lago instance', () => {
	beforeAll(async () => {
		for (const externalId of externalIds) {
			await call('/customers', {
				method: 'POST',
				body: JSON.stringify({ customer: { external_id: externalId, name: externalId } }),
			});
		}
	}, 60_000);

	afterAll(async () => {
		for (const externalId of externalIds) {
			await call(`/customers/${externalId}`, { method: 'DELETE' });
		}
	}, 60_000);

	describe('pagination', () => {
		it('reads a real page and its cursor', async () => {
			const result = await call('/customers?per_page=2&page=1');
			const page = extractPage(result.body, 'customers');
			expect(page.items.length).toBe(2);
			expect(page.nextPage).toBe(2);
			expect(page.totalCount).toBeGreaterThanOrEqual(externalIds.length);
		});

		// The whole point of the loop: several real round trips, driven by the server's own
		// cursor rather than by an assumed page sequence.
		it('walks every page of a real collection', async () => {
			const collected = await collectAll<{ external_id: string }>(
				async ({ page, perPage }) => {
					const result = await call(`/customers?per_page=${perPage}&page=${page}`);
					return extractPage(result.body, 'customers');
				},
				{ returnAll: true, limit: 0, pageSize: 2 },
			);

			for (const externalId of externalIds) {
				expect(collected.some((customer) => customer.external_id === externalId)).toBe(true);
			}
		});

		it('stops at the limit without reading the whole collection', async () => {
			let requests = 0;
			const collected = await collectAll(
				async ({ page, perPage }) => {
					requests += 1;
					const result = await call(`/customers?per_page=${perPage}&page=${page}`);
					return extractPage(result.body, 'customers');
				},
				{ returnAll: false, limit: 3, pageSize: 2 },
			);

			expect(collected).toHaveLength(3);
			expect(requests).toBe(2);
		});

		it('reports the final page with a null cursor', async () => {
			const result = await call('/customers?per_page=100&page=1');
			expect(extractPage(result.body, 'customers').nextPage).toBeUndefined();
		});
	});

	describe('error shapes', () => {
		it('maps a real 404 to a message naming the resource', async () => {
			const result = await call('/customers/definitely-not-a-customer');
			expect(result.status).toBe(404);

			const described = describeLagoError(asHttpError(result), {
				resource: 'Customer',
				resourceId: 'definitely-not-a-customer',
			});
			expect(described.message).toBe('Customer definitely-not-a-customer was not found');
		});

		// This is the shape that is easy to miss: no `code`, and the explanation inlined into
		// `error` rather than in `error_details`.
		it('maps a real 400 from a missing wrapper key', async () => {
			const result = await call('/customers', { method: 'POST', body: JSON.stringify({}) });
			expect(result.status).toBe(400);

			const described = describeLagoError(asHttpError(result));
			expect(described.message).toMatch(/param is missing/);
			expect(described.message).not.toMatch(/^BadRequest:/);
		});

		it('maps a real 422 to wording that names the offending field', async () => {
			const result = await call('/webhook_endpoints', {
				method: 'POST',
				body: JSON.stringify({
					webhook_endpoint: {
						webhook_url: `https://example.test/${runId}`,
						event_types: ['invoice_created'],
					},
				}),
			});
			expect(result.status).toBe(422);

			const described = describeLagoError(asHttpError(result), { resource: 'Webhook Endpoint' });
			expect(described.message).toMatch(/^event_types:/);
			expect(described.message).toMatch(/invoice_created/);
		});

		it('maps a real 401 to the credential, not to the request', async () => {
			const response = await fetch(`${api}/customers`, {
				headers: { Authorization: 'Bearer not-a-real-key' },
			});
			const described = describeLagoError({
				statusCode: response.status,
				response: { status: response.status, body: await response.json() },
			});
			expect(described.message).toBe('Lago rejected the API key');
		});
	});
});
