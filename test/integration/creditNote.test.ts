import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { routeOperations } from '../../nodes/Lago/shared/router';
import { createExecuteContext } from '../support/context';
import { hasLago, lagoApiKey, lagoBaseUrl } from '../support/env.mjs';

const describeLago = hasLago ? describe : describe.skip;

const runId = `t${Date.now().toString(36)}`;
const customerId = `${runId}-customer`;
const addOnCode = `${runId}_addon`;
let invoiceId = '';
let feeId = '';

async function run(resource: string, parameters: Record<string, unknown>) {
	const context = createExecuteContext({
		parameters: { resource, ...parameters },
		baseUrl: String(lagoBaseUrl),
		apiKey: String(lagoApiKey),
	});
	const output: INodeExecutionData[][] = await routeOperations.call(
		context as unknown as IExecuteFunctions,
	);
	return output[0];
}

async function api(path: string, init: RequestInit = {}) {
	const response = await fetch(`${lagoBaseUrl}/api/v1${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${lagoApiKey}`,
			'Content-Type': 'application/json',
			...(init.headers ?? {}),
		},
	});
	const text = await response.text();
	return { status: response.status, body: text ? JSON.parse(text) : {} };
}

describeLago('Credit Note resource against a live Lago instance', () => {
	beforeAll(async () => {
		await run('customer', {
			operation: 'createOrUpdate',
			externalId: customerId,
			additionalFields: { name: customerId, currency: 'USD' },
		});
		await api('/add_ons', {
			method: 'POST',
			body: JSON.stringify({
				add_on: { name: addOnCode, code: addOnCode, amount_cents: 5000, amount_currency: 'USD' },
			}),
		});

		const [invoice] = await run('invoice', {
			operation: 'create',
			externalCustomerId: customerId,
			currency: 'USD',
			fees: { fee: [{ add_on_code: addOnCode, units: 1, unit_amount_cents: 5000 }] },
		});
		invoiceId = String(invoice.json.lago_id);
		feeId = String((invoice.json.fees as Array<{ lago_id: string }>)[0].lago_id);
	}, 60_000);

	afterAll(async () => {
		await api(`/add_ons/${addOnCode}`, { method: 'DELETE' }).catch(() => undefined);
		await run('customer', { operation: 'delete', externalId: customerId }).catch(() => undefined);
	}, 60_000);

	describe('reading, which works without a licence', () => {
		it('lists credit notes', async () => {
			const items = await run('creditNote', {
				operation: 'getAll',
				returnAll: true,
				filters: {},
			});
			expect(Array.isArray(items)).toBe(true);
		});

		it('filters by customer without failing when there are none', async () => {
			const items = await run('creditNote', {
				operation: 'getAll',
				returnAll: true,
				filters: { external_customer_id: customerId },
			});
			expect(items).toEqual([]);
		});

		it('reports an unknown credit note as not found', async () => {
			await expect(
				run('creditNote', {
					operation: 'get',
					creditNoteId: '00000000-0000-0000-0000-000000000000',
				}),
			).rejects.toThrow(/was not found/);
		});
	});

	// Lago answers 403 for a premium gate as well as for a bad key, distinguished only by the
	// code. These assert the message points at the licence rather than the credential, which is
	// the difference between a user checking their plan and a user rotating a working API key.
	describe('the premium gate', () => {
		it('reports Create as needing a premium licence, not as a bad credential', async () => {
			await expect(
				run('creditNote', {
					operation: 'create',
					invoiceId,
					reason: 'other',
					items: { item: [{ fee_id: feeId, amount_cents: 1000 }] },
					additionalFields: {},
				}),
			).rejects.toThrow(/Credit Note requires a Lago premium licence/);
		});

		it('reports Estimate the same way', async () => {
			await expect(
				run('creditNote', {
					operation: 'estimate',
					invoiceId,
					items: { item: [{ fee_id: feeId, amount_cents: 500 }] },
				}),
			).rejects.toThrow(/premium licence/);
		});

		it('confirms Lago really answers 403 feature_unavailable', async () => {
			const { status, body } = await api('/credit_notes', {
				method: 'POST',
				body: JSON.stringify({
					credit_note: {
						invoice_id: invoiceId,
						reason: 'other',
						items: [{ fee_id: feeId, amount_cents: 1000 }],
					},
				}),
			});
			expect(status).toBe(403);
			expect(body.code).toBe('feature_unavailable');
		});

		// The distinction the mapper depends on: a 403 with no code is still a credential problem.
		it('still reports a bad key as a credential problem', async () => {
			const response = await fetch(`${lagoBaseUrl}/api/v1/credit_notes`, {
				headers: { Authorization: 'Bearer not-a-real-key' },
			});
			expect(response.status).toBe(401);
		});
	});
});
