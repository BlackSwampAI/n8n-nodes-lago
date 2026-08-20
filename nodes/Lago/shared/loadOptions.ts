import type { ILoadOptionsFunctions, INodePropertyOptions, JsonObject } from 'n8n-workflow';
import { lagoApiRequestAllItems } from './transport';

/**
 * Billable metric codes, for fields that must match one exactly.
 *
 * Lago accepts an event whose code matches no active metric and then silently ignores it, so
 * choosing from real codes is what stops a typo becoming a month of unbilled usage.
 */
export async function getBillableMetricCodes(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	const metrics = await lagoApiRequestAllItems<JsonObject>(
		this,
		'/billable_metrics',
		'billable_metrics',
		{ returnAll: true, limit: 0, resource: 'Billable Metric' },
	);

	return metrics
		.map((metric) => ({
			name: `${String(metric.name ?? metric.code)} (${String(metric.code)})`,
			value: String(metric.code),
			description: typeof metric.description === 'string' ? metric.description : undefined,
		}))
		.sort((a, b) => a.name.localeCompare(b.name));
}
