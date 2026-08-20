import type { IDataObject, INodeProperties, JsonObject } from 'n8n-workflow';
import { lagoApiRequest } from '../../shared/transport';
import type { OperationHandler } from '../../shared/types';
import { AGGREGATIONS_NEEDING_FIELD, billableMetricFields, buildFilters } from './fields';

export const createFields: INodeProperties[] = billableMetricFields('create');

export const create: OperationHandler = async function (index) {
	const code = this.getNodeParameter('code', index) as string;
	const name = this.getNodeParameter('name', index) as string;
	const aggregationType = this.getNodeParameter('aggregationType', index) as string;
	const additionalFields = this.getNodeParameter('additionalFields', index, {}) as IDataObject;
	const filters = this.getNodeParameter('filters.filter', index, []) as IDataObject[];

	const billableMetric: IDataObject = {
		code,
		name,
		aggregation_type: aggregationType,
		...additionalFields,
	};

	if (AGGREGATIONS_NEEDING_FIELD.includes(aggregationType)) {
		billableMetric.field_name = this.getNodeParameter('fieldName', index) as string;
	}

	const built = buildFilters(filters);
	if (built.length > 0) billableMetric.filters = built;

	const response = await lagoApiRequest.call(this, 'POST', '/billable_metrics', {
		body: { billable_metric: billableMetric },
		resource: 'Billable Metric',
		resourceId: code,
	});

	return response.billable_metric as JsonObject;
};
