import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { routeOperations } from '../../nodes/Lago/shared/router';
import { createExecuteContext } from '../support/context';
import { hasLago, lagoApiKey, lagoBaseUrl } from '../support/env.mjs';

const describeLago = hasLago ? describe : describe.skip;

const runId = `t${Date.now().toString(36)}`;
const planCode = `${runId}_plan`;
const metricCode = `${runId}_metric`;
let metricId = '';

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

/** Adds a charge of one model, with only that model's fields populated. */
async function addCharge(chargeCode: string, chargeModel: string, fields: Record<string, unknown>) {
	return run('planCharge', {
		operation: 'create',
		planCode,
		chargeCode,
		billableMetricId: metricId,
		chargeModel,
		additionalFields: {},
		...fields,
	});
}

describeLago('Plan Charge resource against a live Lago instance', () => {
	beforeAll(async () => {
		const [metric] = await run('billableMetric', {
			operation: 'create',
			code: metricCode,
			name: metricCode,
			aggregationType: 'sum_agg',
			fieldName: 'units',
			additionalFields: {},
			filters: {},
		});
		metricId = String(metric.json.lago_id);

		await run('plan', {
			operation: 'create',
			code: planCode,
			name: planCode,
			interval: 'monthly',
			amountCents: 0,
			amountCurrency: 'USD',
			payInAdvance: false,
			additionalFields: {},
		});
	}, 60_000);

	afterAll(async () => {
		await run('plan', { operation: 'delete', code: planCode }).catch(() => undefined);
		await run('billableMetric', { operation: 'delete', code: metricCode }).catch(() => undefined);
	}, 60_000);

	// Every model is exercised against the server, because the properties differ completely
	// between them and a mistake in any one would only appear at invoicing.
	describe('charge models', () => {
		it('creates a standard charge', async () => {
			const [item] = await addCharge(`${runId}_standard`, 'standard', { amount: '0.01' });
			expect(item.json.charge_model).toBe('standard');
			expect((item.json.properties as Record<string, unknown>).amount).toBe('0.01');
		});

		it('creates a package charge', async () => {
			const [item] = await addCharge(`${runId}_package`, 'package', {
				packageAmount: '10',
				packageSize: 100,
				freeUnits: 10,
			});
			const properties = item.json.properties as Record<string, unknown>;
			expect(properties.amount).toBe('10');
			expect(properties.package_size).toBe(100);
			expect(properties.free_units).toBe(10);
		});

		it('creates a percentage charge with its optional caps', async () => {
			const [item] = await addCharge(`${runId}_percentage`, 'percentage', {
				rate: '1.5',
				fixedAmount: '0.30',
				percentageOptions: { per_transaction_max_amount: '50', free_units_per_events: 5 },
			});
			const properties = item.json.properties as Record<string, unknown>;
			expect(properties.rate).toBe('1.5');
			expect(properties.fixed_amount).toBe('0.30');
			expect(properties.per_transaction_max_amount).toBe('50');
		});

		it('creates a graduated charge from tier rows', async () => {
			const [item] = await addCharge(`${runId}_graduated`, 'graduated', {
				graduatedRanges: {
					range: [
						{ from_value: 0, to_value: 100, per_unit_amount: '0.05', flat_amount: '0' },
						{ from_value: 101, to_value: 0, per_unit_amount: '0.02', flat_amount: '0' },
					],
				},
			});
			const ranges = (item.json.properties as { graduated_ranges: Array<Record<string, unknown>> })
				.graduated_ranges;
			expect(ranges).toHaveLength(2);
			// The last tier is left unbounded, which is what a to_value of 0 in the form means.
			expect(ranges[1].to_value).toBeNull();
			expect(ranges[0].per_unit_amount).toBe('0.05');
		});

		it('creates a volume charge from tier rows', async () => {
			const [item] = await addCharge(`${runId}_volume`, 'volume', {
				volumeRanges: {
					range: [
						{ from_value: 0, to_value: 1000, per_unit_amount: '0.01', flat_amount: '0' },
						{ from_value: 1001, to_value: 0, per_unit_amount: '0.005', flat_amount: '0' },
					],
				},
			});
			const ranges = (item.json.properties as { volume_ranges: Array<Record<string, unknown>> })
				.volume_ranges;
			expect(ranges).toHaveLength(2);
			expect(ranges[1].to_value).toBeNull();
		});

		// The only charge model Lago gates. On the free edition it is refused, and the option's
		// description says so rather than leaving a workflow author to discover it at runtime.
		it('reports that graduated percentage needs a premium licence', async () => {
			await expect(
				addCharge(`${runId}_gradpct`, 'graduated_percentage', {
					graduatedPercentageRanges: {
						range: [
							{ from_value: 0, to_value: 100, rate: '2', flat_amount: '0' },
							{ from_value: 101, to_value: 0, rate: '1', flat_amount: '0' },
						],
					},
				}),
			).rejects.toThrow(/premium_license/);
		});

		it('creates a dynamic charge, which carries no properties of its own', async () => {
			const [item] = await addCharge(`${runId}_dynamic`, 'dynamic', {});
			expect(item.json.charge_model).toBe('dynamic');
		});
	});

	describe('reading and changing charges', () => {
		it('lists the charges on the plan', async () => {
			const items = await run('planCharge', { operation: 'getAll', planCode, returnAll: true });
			expect(items.length).toBeGreaterThanOrEqual(6);
			for (const item of items) expect(item.json.billable_metric_code).toBe(metricCode);
		});

		it('gets a single charge by its code', async () => {
			const [item] = await run('planCharge', {
				operation: 'get',
				planCode,
				chargeCode: `${runId}_standard`,
			});
			expect(item.json.charge_model).toBe('standard');
		});

		it('updates a charge', async () => {
			const [item] = await run('planCharge', {
				operation: 'update',
				planCode,
				chargeCode: `${runId}_standard`,
				chargeModel: 'standard',
				amount: '0.02',
				additionalFields: { invoice_display_name: 'Renamed charge' },
			});
			expect((item.json.properties as Record<string, unknown>).amount).toBe('0.02');
			expect(item.json.invoice_display_name).toBe('Renamed charge');
		});

		it('deletes a charge', async () => {
			await run('planCharge', {
				operation: 'delete',
				planCode,
				chargeCode: `${runId}_dynamic`,
			});

			const items = await run('planCharge', { operation: 'getAll', planCode, returnAll: true });
			expect(items.some((item) => item.json.code === `${runId}_dynamic`)).toBe(false);
		});
	});

	describe('what Lago refuses', () => {
		// Money is a decimal string here, unlike the plan's integer cents. A JSON number is
		// rejected outright, which is why every amount field is typed as text.
		it('rejects a numeric amount, which is why amounts are strings', async () => {
			const response = await fetch(`${lagoBaseUrl}/api/v1/plans/${planCode}/charges`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${lagoApiKey}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					charge: {
						billable_metric_id: metricId,
						code: `${runId}_numeric`,
						charge_model: 'standard',
						properties: { amount: 2.5 },
					},
				}),
			});
			expect(response.status).toBe(422);
			expect(JSON.stringify(await response.json())).toMatch(/invalid_amount/);
		});

		// Not refused, which is worse: the free edition accepts the value and stores zero, so a
		// spend floor silently never applies. Only the field description can warn anyone.
		it('silently stores zero for a premium minimum amount', async () => {
			const [item] = await addCharge(`${runId}_minimum`, 'standard', {
				amount: '1',
				additionalFields: { min_amount_cents: 500 },
			});
			expect(item.json.min_amount_cents).toBe(0);
		});

		// Lago names neither the metric nor the requirement in the field, only in the error.
		it('rejects prorated unless the billable metric is recurring', async () => {
			await expect(
				addCharge(`${runId}_prorated`, 'standard', {
					amount: '1',
					additionalFields: { prorated: true },
				}),
			).rejects.toThrow(/invalid_billable_metric_or_charge_model/);
		});

		it('rejects a charge with no code, which is why Charge Code is required', async () => {
			const response = await fetch(`${lagoBaseUrl}/api/v1/plans/${planCode}/charges`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${lagoApiKey}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					charge: {
						billable_metric_id: metricId,
						charge_model: 'standard',
						properties: { amount: '1' },
					},
				}),
			});
			expect(response.status).toBe(422);
			expect(JSON.stringify(await response.json())).toMatch(/value_is_mandatory/);
		});
	});
});
