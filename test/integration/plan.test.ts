import { afterAll, describe, expect, it, vi } from 'vitest';
import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { routeOperations } from '../../nodes/Lago/shared/router';
import { createExecuteContext } from '../support/context';
import { hasLago, lagoApiKey, lagoBaseUrl } from '../support/env.mjs';

const describeLago = hasLago ? describe : describe.skip;

const runId = `t${Date.now().toString(36)}`;
const created = new Set<string>();

async function run(parameters: Record<string, unknown>) {
	const context = createExecuteContext({
		parameters: { resource: 'plan', ...parameters },
		baseUrl: String(lagoBaseUrl),
		apiKey: String(lagoApiKey),
	});
	const output: INodeExecutionData[][] = await routeOperations.call(
		context as unknown as IExecuteFunctions,
	);
	return output[0];
}

async function createPlan(code: string, parameters: Record<string, unknown> = {}) {
	created.add(code);
	return run({
		operation: 'create',
		code,
		name: code,
		interval: 'monthly',
		amountCents: 10000,
		amountCurrency: 'USD',
		payInAdvance: false,
		additionalFields: {},
		...parameters,
	});
}

describeLago('Plan resource against a live Lago instance', () => {
	afterAll(async () => {
		for (const code of created) {
			await run({ operation: 'delete', code }).catch(() => undefined);
		}
	}, 60_000);

	describe('lifecycle', () => {
		it('creates a plan and returns the record, not the envelope', async () => {
			const code = `${runId}_basic`;
			const [item] = await createPlan(code);

			expect(item.json.code).toBe(code);
			expect(item.json.interval).toBe('monthly');
			expect(item.json.plan).toBeUndefined();
		});

		// Confirms the unit really is minor: 10000 must come back as 10000, not 1000000.
		it('treats the amount as cents rather than a decimal', async () => {
			const [item] = await run({ operation: 'get', code: `${runId}_basic` });
			expect(item.json.amount_cents).toBe(10000);
			expect(item.json.amount_currency).toBe('USD');
		});

		it('creates a pay-as-you-go plan with a zero base cost', async () => {
			const code = `${runId}_payg`;
			const [item] = await createPlan(code, { amountCents: 0 });
			expect(item.json.amount_cents).toBe(0);
		});

		it('passes optional fields through from Additional Fields', async () => {
			const code = `${runId}_trial`;
			const [item] = await createPlan(code, { additionalFields: { trial_period: 5 } });
			expect(item.json.trial_period).toBe(5);
		});

		it('updates a plan in place', async () => {
			const code = `${runId}_basic`;
			const [item] = await run({
				operation: 'update',
				code,
				additionalFields: { name: 'Renamed Plan', amount_cents: 25000 },
			});

			expect(item.json.name).toBe('Renamed Plan');
			expect(item.json.amount_cents).toBe(25000);
		});

		// Lago queues plan deletion rather than performing it inline. The DELETE answers 200 with
		// the plan, and the plan stays readable — through Get and through Get Many — until the
		// background job runs. A workflow that deletes a plan and immediately checks for its
		// absence will see it still there, which is why the Delete operation says so.
		it('deletes a plan, which takes effect asynchronously', async () => {
			const code = `${runId}_doomed`;
			await createPlan(code);

			const [deleted] = await run({ operation: 'delete', code });
			expect(deleted.json.code).toBe(code);
			created.delete(code);

			await vi.waitFor(
				async () => {
					await expect(run({ operation: 'get', code })).rejects.toThrow(/was not found/);
				},
				{ timeout: 15_000, interval: 500 },
			);
		}, 30_000);

		it('removes the plan from Get Many once the deletion is processed', async () => {
			const code = `${runId}_async`;
			await createPlan(code);
			await run({ operation: 'delete', code });
			created.delete(code);

			await vi.waitFor(
				async () => {
					const items = await run({ operation: 'getAll', returnAll: true });
					expect(items.some((item) => item.json.code === code)).toBe(false);
				},
				{ timeout: 15_000, interval: 500 },
			);
		}, 30_000);
	});

	describe('interval rules', () => {
		it('accepts monthly charge billing on a yearly plan', async () => {
			const code = `${runId}_yearly`;
			const [item] = await createPlan(code, {
				interval: 'yearly',
				billChargesMonthly: true,
			});
			expect(item.json.bill_charges_monthly).toBe(true);
		});

		// Lago does not reject bill_charges_monthly on a short interval — it accepts the request
		// and silently drops the value. That is a stronger reason to hide the field than a
		// rejection would be: a user who set it on a monthly plan would see success, no error,
		// and no effect.
		it('silently ignores monthly charge billing on a monthly plan', async () => {
			const code = `${runId}_ignored`;
			created.add(code);

			const response = await fetch(`${lagoBaseUrl}/api/v1/plans`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${lagoApiKey}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					plan: {
						code,
						name: 'ignored',
						interval: 'monthly',
						amount_cents: 1000,
						amount_currency: 'USD',
						pay_in_advance: false,
						bill_charges_monthly: true,
					},
				}),
			});

			expect(response.status).toBe(200);
			const body = (await response.json()) as { plan: { bill_charges_monthly: unknown } };
			expect(body.plan.bill_charges_monthly).toBeNull();
		});
	});

	describe('listing', () => {
		it('returns every plan when Return All is set', async () => {
			const code = `${runId}_listed`;
			await createPlan(code);

			const items = await run({ operation: 'getAll', returnAll: true });
			expect(items.some((item) => item.json.code === code)).toBe(true);
		});

		it('honours the limit', async () => {
			await createPlan(`${runId}_list_a`);
			await createPlan(`${runId}_list_b`);

			const items = await run({ operation: 'getAll', returnAll: false, limit: 2 });
			expect(items).toHaveLength(2);
		});
	});
});
