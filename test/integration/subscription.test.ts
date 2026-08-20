import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { routeOperations } from '../../nodes/Lago/shared/router';
import { createExecuteContext } from '../support/context';
import { hasLago, lagoApiKey, lagoBaseUrl } from '../support/env.mjs';

const describeLago = hasLago ? describe : describe.skip;

const runId = `t${Date.now().toString(36)}`;
const customerId = `${runId}-customer`;
const cheapPlan = `${runId}_cheap`;
const dearPlan = `${runId}_dear`;
const subscriptions = new Set<string>();

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

async function subscribe(
	externalId: string,
	planCode: string,
	extra: Record<string, unknown> = {},
) {
	subscriptions.add(externalId);
	return run('subscription', {
		operation: 'create',
		externalCustomerId: customerId,
		planCode,
		externalId,
		additionalFields: {},
		...extra,
	});
}

/** Statuses of every subscription sharing an external ID, which is how upgrades are observed. */
async function statusesOf(externalId: string) {
	const items = await run('subscription', {
		operation: 'getAll',
		returnAll: true,
		filters: { status: ['active', 'pending', 'terminated', 'canceled'] },
	});
	return items
		.filter((item) => item.json.external_id === externalId)
		.map((item) => `${item.json.status}:${item.json.plan_code}`)
		.sort();
}

describeLago('Subscription resource against a live Lago instance', () => {
	beforeAll(async () => {
		await run('customer', {
			operation: 'createOrUpdate',
			externalId: customerId,
			additionalFields: { name: customerId, currency: 'USD' },
		});
		for (const [code, amount] of [
			[cheapPlan, 1000],
			[dearPlan, 9000],
		] as Array<[string, number]>) {
			await run('plan', {
				operation: 'create',
				code,
				name: code,
				interval: 'monthly',
				amountCents: amount,
				amountCurrency: 'USD',
				payInAdvance: false,
				additionalFields: {},
			});
		}
	}, 60_000);

	afterAll(async () => {
		for (const externalId of subscriptions) {
			await run('subscription', { operation: 'terminate', externalId, status: 'pending' }).catch(
				() => undefined,
			);
			await run('subscription', { operation: 'terminate', externalId, status: 'active' }).catch(
				() => undefined,
			);
		}
		for (const code of [cheapPlan, dearPlan]) {
			await run('plan', { operation: 'delete', code }).catch(() => undefined);
		}
		await run('customer', { operation: 'delete', externalId: customerId }).catch(() => undefined);
	}, 60_000);

	describe('lifecycle', () => {
		it('subscribes a customer to a plan', async () => {
			const [item] = await subscribe(`${runId}-basic`, cheapPlan, {
				additionalFields: { billing_time: 'anniversary', name: 'Basic subscription' },
			});

			expect(item.json.external_id).toBe(`${runId}-basic`);
			expect(item.json.status).toBe('active');
			expect(item.json.plan_code).toBe(cheapPlan);
			expect(item.json.billing_time).toBe('anniversary');
			expect(item.json.subscription).toBeUndefined();
		});

		it('reads the subscription back by external ID', async () => {
			const [item] = await run('subscription', {
				operation: 'get',
				externalId: `${runId}-basic`,
			});
			expect(item.json.plan_code).toBe(cheapPlan);
		});

		it('updates the display name', async () => {
			const [item] = await run('subscription', {
				operation: 'update',
				externalId: `${runId}-basic`,
				additionalFields: { name: 'Renamed subscription' },
			});
			expect(item.json.name).toBe('Renamed subscription');
		});
	});

	describe('termination', () => {
		it('terminates rather than deletes, keeping the record', async () => {
			const externalId = `${runId}-ending`;
			await subscribe(externalId, cheapPlan);

			const [item] = await run('subscription', {
				operation: 'terminate',
				externalId,
				status: 'active',
			});
			expect(item.json.status).toBe('terminated');
			expect(item.json.terminated_at).toBeTruthy();
		});

		// Get and Get Many disagree about a terminated subscription, which is worth knowing before
		// a workflow treats a 404 as proof the record is gone.
		it('reports a terminated subscription as not found on Get', async () => {
			await expect(
				run('subscription', { operation: 'get', externalId: `${runId}-ending` }),
			).rejects.toThrow(/was not found/);
		});

		it('still lists it when the terminated status is selected', async () => {
			expect(await statusesOf(`${runId}-ending`)).toContain(`terminated:${cheapPlan}`);
		});

		// The default that surprises people: an empty status filter means active only.
		it('omits it from Get Many when no status filter is given', async () => {
			const items = await run('subscription', {
				operation: 'getAll',
				returnAll: true,
				filters: {},
			});
			expect(items.some((item) => item.json.external_id === `${runId}-ending`)).toBe(false);
		});
	});

	describe('plan changes', () => {
		// Create doubles as upgrade: the same external ID on a dearer plan replaces the live
		// subscription immediately and terminates the old one.
		it('upgrades in place when the same external ID is sent with a dearer plan', async () => {
			const externalId = `${runId}-upgrade`;
			await subscribe(externalId, cheapPlan);

			const [item] = await subscribe(externalId, dearPlan);
			expect(item.json.status).toBe('active');
			expect(item.json.plan_code).toBe(dearPlan);

			expect(await statusesOf(externalId)).toEqual([
				`active:${dearPlan}`,
				`terminated:${cheapPlan}`,
			]);
		});

		// A downgrade is deferred to the end of the period, and — the confusing part — the response
		// describes the subscription that is still running, not the one just scheduled.
		it('schedules a downgrade and returns the still-active subscription', async () => {
			const externalId = `${runId}-downgrade`;
			await subscribe(externalId, dearPlan);

			const [item] = await subscribe(externalId, cheapPlan);
			expect(item.json.status).toBe('active');
			expect(item.json.plan_code).toBe(dearPlan);

			expect(await statusesOf(externalId)).toEqual([`active:${dearPlan}`, `pending:${cheapPlan}`]);
		});

		// Why Terminate carries a Status option: without it the pending downgrade is unreachable.
		it('cancels a scheduled downgrade when terminating the pending subscription', async () => {
			const externalId = `${runId}-downgrade`;

			const [item] = await run('subscription', {
				operation: 'terminate',
				externalId,
				status: 'pending',
			});
			expect(item.json.status).toBe('canceled');
			expect(item.json.plan_code).toBe(cheapPlan);

			expect(await statusesOf(externalId)).toContain(`active:${dearPlan}`);
		});
	});

	describe('listing', () => {
		it('filters by customer', async () => {
			const items = await run('subscription', {
				operation: 'getAll',
				returnAll: true,
				filters: { external_customer_id: customerId },
			});
			expect(items.length).toBeGreaterThan(0);
			for (const item of items) {
				expect(item.json.external_customer_id).toBe(customerId);
			}
		});

		it('filters by plan code', async () => {
			const items = await run('subscription', {
				operation: 'getAll',
				returnAll: true,
				filters: { plan_code: dearPlan },
			});
			expect(items.length).toBeGreaterThan(0);
			for (const item of items) {
				expect(item.json.plan_code).toBe(dearPlan);
			}
		});

		it('honours the limit', async () => {
			const items = await run('subscription', {
				operation: 'getAll',
				returnAll: false,
				limit: 1,
				filters: { external_customer_id: customerId },
			});
			expect(items).toHaveLength(1);
		});
	});
});
