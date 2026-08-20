import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { routeOperations } from '../../nodes/Lago/shared/router';
import { createExecuteContext } from '../support/context';
import { hasLago, lagoApiKey, lagoBaseUrl } from '../support/env.mjs';

const describeLago = hasLago ? describe : describe.skip;

const runId = `t${Date.now().toString(36)}`;
const customerId = `${runId}-customer`;
const meteredMetric = `${runId}_tokens`;
const advanceMetric = `${runId}_calls`;
const planCode = `${runId}_metered`;
const subscriptionId = `${runId}-sub`;

/** Cents charged per unit, so expected usage is a plain multiplication. */
const UNIT_AMOUNT = 0.01;

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

/** Direct call, for the parts of Lago the node does not cover yet. */
async function api(path: string, init: RequestInit = {}) {
	const response = await fetch(`${lagoBaseUrl}/api/v1${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${lagoApiKey}`,
			'Content-Type': 'application/json',
			...(init.headers ?? {}),
		},
	});
	return { status: response.status, body: (await response.json()) as Record<string, never> };
}

async function currentUsage() {
	const { body } = await api(
		`/customers/${customerId}/current_usage?external_subscription_id=${subscriptionId}`,
	);
	return body.customer_usage as unknown as {
		total_amount_cents: number;
		charges_usage: Array<{
			billable_metric: { code: string };
			units: string;
			amount_cents: number;
		}>;
	};
}

describeLago('Event resource against a live Lago instance', () => {
	beforeAll(async () => {
		await run('customer', {
			operation: 'createOrUpdate',
			externalId: customerId,
			additionalFields: { name: customerId, currency: 'USD' },
		});

		const metricIds: Record<string, string> = {};
		for (const code of [meteredMetric, advanceMetric]) {
			const [metric] = await run('billableMetric', {
				operation: 'create',
				code,
				name: code,
				aggregationType: 'sum_agg',
				fieldName: 'units',
				additionalFields: {},
				filters: {},
			});
			metricIds[code] = String(metric.json.lago_id);
		}

		// Charges reference the metric by Lago's UUID rather than by code, and the Plan Charge
		// resource does not exist yet, so the plan is created directly.
		await api('/plans', {
			method: 'POST',
			body: JSON.stringify({
				plan: {
					code: planCode,
					name: planCode,
					interval: 'monthly',
					amount_cents: 0,
					amount_currency: 'USD',
					pay_in_advance: false,
					charges: [
						{
							billable_metric_id: metricIds[meteredMetric],
							charge_model: 'standard',
							properties: { amount: String(UNIT_AMOUNT) },
						},
						{
							billable_metric_id: metricIds[advanceMetric],
							charge_model: 'standard',
							pay_in_advance: true,
							properties: { amount: String(UNIT_AMOUNT) },
						},
					],
				},
			}),
		});

		await run('subscription', {
			operation: 'create',
			externalCustomerId: customerId,
			planCode,
			externalId: subscriptionId,
			additionalFields: {},
		});
	}, 120_000);

	afterAll(async () => {
		await run('subscription', {
			operation: 'terminate',
			externalId: subscriptionId,
			status: 'active',
		}).catch(() => undefined);
		await run('plan', { operation: 'delete', code: planCode }).catch(() => undefined);
		for (const code of [meteredMetric, advanceMetric]) {
			await run('billableMetric', { operation: 'delete', code }).catch(() => undefined);
		}
		await run('customer', { operation: 'delete', externalId: customerId }).catch(() => undefined);
	}, 120_000);

	describe('sending usage', () => {
		it('sends an event and echoes the transaction ID', async () => {
			const [item] = await run('event', {
				operation: 'send',
				externalSubscriptionId: subscriptionId,
				code: meteredMetric,
				transactionId: `${runId}-tx-1`,
				timestamp: '',
				properties: { property: [{ key: 'units', value: '250' }] },
			});

			expect(item.json.transaction_id).toBe(`${runId}-tx-1`);
			expect(item.json.code).toBe(meteredMetric);
			expect(item.json.event).toBeUndefined();
		});

		// The whole point of the resource: usage has to actually reach the bill.
		it('aggregates the usage onto the subscription', async () => {
			await vi.waitFor(
				async () => {
					const usage = await currentUsage();
					const charge = usage.charges_usage.find(
						(entry) => entry.billable_metric.code === meteredMetric,
					);
					expect(Number(charge?.units)).toBe(250);
					expect(charge?.amount_cents).toBe(250 * UNIT_AMOUNT * 100);
				},
				{ timeout: 30_000, interval: 1_000 },
			);
		}, 45_000);

		// n8n's key/value input is string-typed. Without coercion Lago would receive "250" and a
		// Sum metric would not add it up the way the workflow author expects.
		it('sends numeric properties as numbers', async () => {
			const [item] = await run('event', {
				operation: 'get',
				transactionId: `${runId}-tx-1`,
			});
			expect((item.json.properties as Record<string, unknown>).units).toBe(250);
		});

		it('derives a transaction ID when none is given, so retries stay idempotent', async () => {
			const [item] = await run('event', {
				operation: 'send',
				externalSubscriptionId: subscriptionId,
				code: meteredMetric,
				transactionId: '',
				timestamp: '',
				properties: { property: [{ key: 'units', value: '1' }] },
			});
			expect(String(item.json.transaction_id)).toMatch(/-0$/);
		});

		it('accepts an explicit timestamp', async () => {
			const when = '2026-08-01T12:00:00Z';
			const [item] = await run('event', {
				operation: 'send',
				externalSubscriptionId: subscriptionId,
				code: meteredMetric,
				transactionId: `${runId}-tx-dated`,
				timestamp: when,
				properties: { property: [{ key: 'units', value: '5' }] },
			});
			expect(new Date(String(item.json.timestamp)).toISOString()).toBe(
				new Date(when).toISOString(),
			);
		});
	});

	// The behaviour that justifies choosing the code from a dropdown rather than typing it.
	describe('an unknown metric code', () => {
		it('is accepted with no error at all', async () => {
			const [item] = await run('event', {
				operation: 'send',
				externalSubscriptionId: subscriptionId,
				code: `${meteredMetric}_typo`,
				transactionId: `${runId}-tx-typo`,
				timestamp: '',
				properties: { property: [{ key: 'units', value: '99999' }] },
			});
			expect(item.json.transaction_id).toBe(`${runId}-tx-typo`);
		});

		it('is stored and visible, yet never reaches the bill', async () => {
			const [stored] = await run('event', {
				operation: 'get',
				transactionId: `${runId}-tx-typo`,
			});
			expect(stored.json.code).toBe(`${meteredMetric}_typo`);

			const usage = await currentUsage();
			expect(
				usage.charges_usage.some((entry) => entry.billable_metric.code.endsWith('_typo')),
			).toBe(false);
		});
	});

	describe('batch sending', () => {
		it('sends several events in one request and returns one item per event', async () => {
			const items = await run('event', {
				operation: 'sendBatch',
				events: {
					event: [
						{
							externalSubscriptionId: subscriptionId,
							code: meteredMetric,
							transactionId: `${runId}-batch-a`,
							properties: { property: [{ key: 'units', value: '10' }] },
						},
						{
							externalSubscriptionId: subscriptionId,
							code: meteredMetric,
							transactionId: `${runId}-batch-b`,
							properties: { property: [{ key: 'units', value: '20' }] },
						},
					],
				},
			});

			expect(items).toHaveLength(2);
			expect(items.map((item) => item.json.transaction_id)).toEqual([
				`${runId}-batch-a`,
				`${runId}-batch-b`,
			]);
		});

		it('derives a distinct transaction ID per event when none is given', async () => {
			const items = await run('event', {
				operation: 'sendBatch',
				events: {
					event: [
						{
							externalSubscriptionId: subscriptionId,
							code: meteredMetric,
							properties: { property: [{ key: 'units', value: '1' }] },
						},
						{
							externalSubscriptionId: subscriptionId,
							code: meteredMetric,
							properties: { property: [{ key: 'units', value: '1' }] },
						},
					],
				},
			});

			const ids = items.map((item) => String(item.json.transaction_id));
			expect(new Set(ids).size).toBe(2);
		});
	});

	describe('reading events', () => {
		it('gets an event by transaction ID', async () => {
			const [item] = await run('event', { operation: 'get', transactionId: `${runId}-batch-a` });
			expect(item.json.code).toBe(meteredMetric);
		});

		it('reports an unknown transaction ID as not found', async () => {
			await expect(
				run('event', { operation: 'get', transactionId: `${runId}-nope` }),
			).rejects.toThrow(/was not found/);
		});

		it('lists events for a subscription', async () => {
			const items = await run('event', {
				operation: 'getAll',
				returnAll: true,
				filters: { external_subscription_id: subscriptionId },
			});
			expect(items.length).toBeGreaterThanOrEqual(5);
		});

		it('filters by metric code', async () => {
			const items = await run('event', {
				operation: 'getAll',
				returnAll: true,
				filters: { external_subscription_id: subscriptionId, code: meteredMetric },
			});
			expect(items.length).toBeGreaterThan(0);
			for (const item of items) expect(item.json.code).toBe(meteredMetric);
		});

		it('honours the limit', async () => {
			const items = await run('event', {
				operation: 'getAll',
				returnAll: false,
				limit: 2,
				filters: { external_subscription_id: subscriptionId },
			});
			expect(items).toHaveLength(2);
		});
	});

	describe('estimating fees', () => {
		it('estimates what a pay-in-advance charge would cost, without recording usage', async () => {
			const items = await run('event', {
				operation: 'estimateFees',
				externalSubscriptionId: subscriptionId,
				code: advanceMetric,
				properties: { property: [{ key: 'units', value: '400' }] },
			});

			expect(items.length).toBeGreaterThan(0);
			expect(items[0].json.amount_cents).toBe(400 * UNIT_AMOUNT * 100);
		});

		it('does not record the estimated usage as an event', async () => {
			const items = await run('event', {
				operation: 'getAll',
				returnAll: true,
				filters: { external_subscription_id: subscriptionId, code: advanceMetric },
			});
			expect(items).toHaveLength(0);
		});
	});
});
