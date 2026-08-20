import { afterAll, describe, expect, it } from 'vitest';
import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { routeOperations } from '../../nodes/Lago/shared/router';
import { createExecuteContext } from '../support/context';
import { hasLago, lagoApiKey, lagoBaseUrl } from '../support/env.mjs';

const describeLago = hasLago ? describe : describe.skip;

const runId = `t${Date.now().toString(36)}`;
const created = new Set<string>();

async function run(
	parameters: Record<string, unknown>,
	options: { items?: Array<Record<string, unknown>>; continueOnFail?: boolean } = {},
) {
	const context = createExecuteContext({
		parameters: { resource: 'billableMetric', ...parameters },
		items: options.items,
		continueOnFail: options.continueOnFail,
		baseUrl: String(lagoBaseUrl),
		apiKey: String(lagoApiKey),
	});
	const output: INodeExecutionData[][] = await routeOperations.call(
		context as unknown as IExecuteFunctions,
	);
	return output[0];
}

async function createMetric(code: string, parameters: Record<string, unknown> = {}) {
	created.add(code);
	return run({
		operation: 'create',
		code,
		name: code,
		aggregationType: 'count_agg',
		additionalFields: {},
		filters: {},
		...parameters,
	});
}

describeLago('Billable Metric resource against a live Lago instance', () => {
	afterAll(async () => {
		for (const code of created) {
			await run({ operation: 'delete', code }).catch(() => undefined);
		}
	}, 60_000);

	describe('lifecycle', () => {
		it('creates a count metric without a field name', async () => {
			const code = `${runId}_count`;
			const [item] = await createMetric(code);

			expect(item.json.code).toBe(code);
			expect(item.json.aggregation_type).toBe('count_agg');
			expect(item.json.billable_metric).toBeUndefined();
		});

		it('creates a sum metric with the field name it aggregates over', async () => {
			const code = `${runId}_sum`;
			const [item] = await createMetric(code, {
				aggregationType: 'sum_agg',
				fieldName: 'tokens',
			});

			expect(item.json.aggregation_type).toBe('sum_agg');
			expect(item.json.field_name).toBe('tokens');
		});

		// The reason Field Name is promoted out of Additional Fields and shown conditionally: Lago
		// rejects the metric outright without it.
		it('confirms Lago rejects a sum metric with no field name', async () => {
			await expect(
				run({
					operation: 'create',
					code: `${runId}_nofield`,
					name: 'no field',
					aggregationType: 'sum_agg',
					fieldName: '',
					additionalFields: {},
					filters: {},
				}),
			).rejects.toThrow(/field_name/);
		});

		it('reads the metric back by code', async () => {
			const code = `${runId}_count`;
			const [item] = await run({ operation: 'get', code });
			expect(item.json.code).toBe(code);
		});

		it('updates a metric in place', async () => {
			const code = `${runId}_count`;
			const [item] = await run({
				operation: 'update',
				code,
				additionalFields: { name: 'Renamed Metric', description: 'updated' },
				filters: {},
			});

			expect(item.json.name).toBe('Renamed Metric');
			expect(item.json.description).toBe('updated');
		});

		it('sends filters as the key/values pairs Lago expects', async () => {
			const code = `${runId}_filtered`;
			const [item] = await createMetric(code, {
				aggregationType: 'sum_agg',
				fieldName: 'tokens',
				filters: { filter: [{ key: 'model', values: 'gpt-4, gpt-3.5' }] },
			});

			// Lago sorts filter values rather than preserving submission order, so this compares as
			// a set. Asserting the submitted order would fail for a reason that has nothing to do
			// with the node.
			const filters = item.json.filters as Array<{ key: string; values: string[] }>;
			expect(filters).toHaveLength(1);
			expect(filters[0].key).toBe('model');
			expect([...filters[0].values].sort()).toEqual(['gpt-3.5', 'gpt-4']);
		});

		it('deletes a metric and reports it gone afterwards', async () => {
			const code = `${runId}_doomed`;
			await createMetric(code);

			const [deleted] = await run({ operation: 'delete', code });
			expect(deleted.json.code).toBe(code);
			created.delete(code);

			await expect(run({ operation: 'get', code })).rejects.toThrow(/was not found/);
		});
	});

	describe('listing', () => {
		it('returns every metric when Return All is set', async () => {
			const code = `${runId}_listed`;
			await createMetric(code);

			const items = await run({ operation: 'getAll', returnAll: true });
			expect(items.some((item) => item.json.code === code)).toBe(true);
		});

		it('honours the limit', async () => {
			await createMetric(`${runId}_list_a`);
			await createMetric(`${runId}_list_b`);

			const items = await run({ operation: 'getAll', returnAll: false, limit: 2 });
			expect(items).toHaveLength(2);
		});
	});

	describe('evaluate expression', () => {
		// The operation that turns an opaque metering failure into an inline check.
		it('evaluates an arithmetic expression against a sample event', async () => {
			const [item] = await run({
				operation: 'evaluateExpression',
				expression: 'round(event.properties.units * 2)',
				eventCode: `${runId}_count`,
				eventProperties: { property: [{ key: 'units', value: '10' }] },
				timestamp: '',
			});

			expect(Number(item.json.value)).toBe(20);
		});

		// n8n's key/value input is string-typed, so without coercion "10" * 2 would behave as
		// string concatenation rather than arithmetic.
		it('coerces numeric-looking properties so arithmetic is arithmetic', async () => {
			const [item] = await run({
				operation: 'evaluateExpression',
				expression: 'event.properties.units + 5',
				eventCode: `${runId}_count`,
				eventProperties: { property: [{ key: 'units', value: '10' }] },
				timestamp: '',
			});

			expect(Number(item.json.value)).toBe(15);
			expect(String(item.json.value)).not.toBe('105');
		});

		it('leaves non-numeric properties as strings, which concat operates on', async () => {
			const [item] = await run({
				operation: 'evaluateExpression',
				expression: "concat(event.properties.model, '-suffix')",
				eventCode: `${runId}_count`,
				eventProperties: { property: [{ key: 'model', value: 'gpt-4' }] },
				timestamp: '',
			});

			expect(String(item.json.value)).toBe('gpt-4-suffix');
		});

		it('refuses to evaluate against no properties rather than reporting a misleading result', async () => {
			await expect(
				run({
					operation: 'evaluateExpression',
					expression: 'event.properties.units * 2',
					eventCode: `${runId}_count`,
					eventProperties: {},
					timestamp: '',
				}),
			).rejects.toThrow(/at least one event property/);
		});

		// Lago's OpenAPI specification documents `round((ended_at - started_at) * units)` as the
		// example expression, and the server rejects it. Properties must be addressed as
		// event.properties.<key>. This is pinned so the field placeholders cannot drift back to
		// the documented-but-invalid form and teach every user the wrong syntax.
		it('rejects the bare-property syntax the specification example uses', async () => {
			await expect(
				run({
					operation: 'evaluateExpression',
					expression: 'round(units * 2)',
					eventCode: `${runId}_count`,
					eventProperties: { property: [{ key: 'units', value: '10' }] },
					timestamp: '',
				}),
			).rejects.toThrow(/invalid_expression/);
		});

		it('surfaces a malformed expression as a Lago validation error', async () => {
			await expect(
				run({
					operation: 'evaluateExpression',
					expression: 'event.properties.units * * 2',
					eventCode: `${runId}_count`,
					eventProperties: { property: [{ key: 'units', value: '10' }] },
					timestamp: '',
				}),
			).rejects.toThrow();
		});
	});
});
