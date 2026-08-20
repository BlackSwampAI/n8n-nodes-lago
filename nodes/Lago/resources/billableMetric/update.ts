import type { IDataObject, INodeProperties, JsonObject } from 'n8n-workflow';
import { lagoApiRequest } from '../../shared/transport';
import type { OperationHandler } from '../../shared/types';
import { billableMetricFields, buildFilters } from './fields';

export const updateFields: INodeProperties[] = billableMetricFields('update');

export const update: OperationHandler = async function (index) {
	const code = this.getNodeParameter('code', index) as string;
	const additionalFields = this.getNodeParameter('additionalFields', index, {}) as IDataObject;
	const filters = this.getNodeParameter('filters.filter', index, []) as IDataObject[];

	const billableMetric: IDataObject = { ...additionalFields };

	const built = buildFilters(filters);
	if (built.length > 0) billableMetric.filters = built;

	const response = await lagoApiRequest.call(
		this,
		'PUT',
		`/billable_metrics/${encodeURIComponent(code)}`,
		{
			body: { billable_metric: billableMetric },
			resource: 'Billable Metric',
			resourceId: code,
		},
	);

	return response.billable_metric as JsonObject;
};
