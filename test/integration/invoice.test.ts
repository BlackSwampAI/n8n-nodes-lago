import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { routeOperations } from '../../nodes/Lago/shared/router';
import { createExecuteContext } from '../support/context';
import { hasLago, lagoApiKey, lagoBaseUrl } from '../support/env.mjs';

const describeLago = hasLago ? describe : describe.skip;

const runId = `t${Date.now().toString(36)}`;
const customerId = `${runId}-customer`;
const addOnCode = `${runId}_addon`;

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

async function newInvoice(cents = 5000) {
	const [item] = await run('invoice', {
		operation: 'create',
		externalCustomerId: customerId,
		currency: 'USD',
		fees: { fee: [{ add_on_code: addOnCode, units: 1, unit_amount_cents: cents }] },
	});
	return item.json;
}

describeLago('Invoice resource against a live Lago instance', () => {
	beforeAll(async () => {
		await run('customer', {
			operation: 'createOrUpdate',
			externalId: customerId,
			additionalFields: { name: customerId, currency: 'USD' },
		});
		// Add-ons are not a resource in this node yet, and a one-off invoice is billed from them.
		await api('/add_ons', {
			method: 'POST',
			body: JSON.stringify({
				add_on: { name: addOnCode, code: addOnCode, amount_cents: 5000, amount_currency: 'USD' },
			}),
		});
	}, 60_000);

	afterAll(async () => {
		await api(`/add_ons/${addOnCode}`, { method: 'DELETE' }).catch(() => undefined);
		await run('customer', { operation: 'delete', externalId: customerId }).catch(() => undefined);
	}, 60_000);

	describe('creating', () => {
		// Unlike an invoice generated from a billing period, a one-off is issued ready to pay.
		it('issues a one-off invoice already finalized', async () => {
			const invoice = await newInvoice();
			expect(invoice.status).toBe('finalized');
			expect(invoice.invoice_type).toBe('one_off');
			expect(invoice.total_amount_cents).toBe(5000);
			expect(invoice.number).toBeTruthy();
		});

		it('bills each fee line at its unit amount in cents', async () => {
			const invoice = await newInvoice(1234);
			expect(invoice.total_amount_cents).toBe(1234);
		});
	});

	describe('reading', () => {
		it('gets an invoice by its Lago ID', async () => {
			const created = await newInvoice();
			const [item] = await run('invoice', { operation: 'get', invoiceId: created.lago_id });
			expect(item.json.lago_id).toBe(created.lago_id);
		});

		it('lists invoices for a customer', async () => {
			const items = await run('invoice', {
				operation: 'getAll',
				returnAll: true,
				filters: { external_customer_id: customerId },
			});
			expect(items.length).toBeGreaterThan(0);
			for (const item of items) expect(item.json.customer).toBeTruthy();
		});

		it('honours the limit', async () => {
			const items = await run('invoice', {
				operation: 'getAll',
				returnAll: false,
				limit: 1,
				filters: { external_customer_id: customerId },
			});
			expect(items).toHaveLength(1);
		});

		it('reports an unknown invoice as not found', async () => {
			await expect(
				run('invoice', {
					operation: 'get',
					invoiceId: '00000000-0000-0000-0000-000000000000',
				}),
			).rejects.toThrow(/was not found/);
		});
	});

	describe('lifecycle', () => {
		it('voids a finalized invoice, keeping the record', async () => {
			const created = await newInvoice();
			const [item] = await run('invoice', { operation: 'void', invoiceId: created.lago_id });
			expect(item.json.status).toBe('voided');
		});

		// The confusing one: Lago reports an already-finalized invoice as not found rather than
		// saying it is already finalized, which is why the operation description says so.
		it('reports finalizing an already-finalized invoice as not found', async () => {
			const created = await newInvoice();
			await expect(
				run('invoice', { operation: 'finalize', invoiceId: created.lago_id }),
			).rejects.toThrow(/was not found/);
		});

		it('records a payment status through Update', async () => {
			const created = await newInvoice();
			const [item] = await run('invoice', {
				operation: 'update',
				invoiceId: created.lago_id,
				additionalFields: { payment_status: 'succeeded' },
				metadata: {},
			});
			expect(item.json.payment_status).toBe('succeeded');
		});

		it('stores metadata on an invoice', async () => {
			const created = await newInvoice();
			const [item] = await run('invoice', {
				operation: 'update',
				invoiceId: created.lago_id,
				additionalFields: {},
				metadata: { metadata: [{ key: 'source', value: 'n8n' }] },
			});
			expect(item.json.metadata).toEqual([
				expect.objectContaining({ key: 'source', value: 'n8n' }),
			]);
		});
	});

	describe('downloading', () => {
		// Rendering is asynchronous: the first call queues the job and answers with an empty body,
		// so the handler reads the invoice back rather than returning that response directly.
		it('returns the invoice even while the PDF is still rendering', async () => {
			const created = await newInvoice();
			const [item] = await run('invoice', { operation: 'download', invoiceId: created.lago_id });
			expect(item.json.lago_id).toBe(created.lago_id);
		});

		it('eventually exposes a file URL for the rendered PDF', async () => {
			const created = await newInvoice();
			await run('invoice', { operation: 'download', invoiceId: created.lago_id });

			await vi.waitFor(
				async () => {
					const [item] = await run('invoice', { operation: 'get', invoiceId: created.lago_id });
					expect(item.json.file_url).toBeTruthy();
				},
				{ timeout: 30_000, interval: 1_000 },
			);
		}, 45_000);
	});

	describe('what the free edition refuses', () => {
		// Recorded so the premium matrix stays evidence-based rather than inferred.
		it('gates invoice refresh behind a premium licence', async () => {
			const created = await newInvoice();
			const { status, body } = await api(`/invoices/${created.lago_id}/refresh`, { method: 'PUT' });
			expect(status).toBe(403);
			expect(body.code).toBe('feature_unavailable');
		});

		// Silently dropped rather than refused, which is why drafts are unreachable here and
		// Finalize cannot be exercised on the free edition.
		it('silently ignores an invoice grace period, so no draft can be produced', async () => {
			const { status, body } = await api('/customers', {
				method: 'POST',
				body: JSON.stringify({
					customer: {
						external_id: customerId,
						billing_configuration: { invoice_grace_period: 3 },
					},
				}),
			});
			expect(status).toBe(200);
			expect(body.customer.billing_configuration.invoice_grace_period).toBeNull();
		});
	});
});
