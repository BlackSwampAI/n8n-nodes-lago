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

/**
 * Billable metrics as Lago's internal identifiers, for fields that reference a metric by ID.
 *
 * Plan charges use `billable_metric_id` rather than the code, and a workflow author has the code
 * and not the UUID, so the list shows names and codes while sending the identifier.
 */
export async function getBillableMetricIds(
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
			value: String(metric.lago_id),
			description: typeof metric.description === 'string' ? metric.description : undefined,
		}))
		.sort((a, b) => a.name.localeCompare(b.name));
}
