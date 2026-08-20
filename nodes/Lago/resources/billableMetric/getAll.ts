import type { INodeProperties, JsonObject } from 'n8n-workflow';
import { lagoApiRequestAllItems } from '../../shared/transport';
import { listPaginationFields } from '../../shared/descriptions';
import type { OperationHandler } from '../../shared/types';

const show = { resource: ['billableMetric'], operation: ['getAll'] };

export const getAllFields: INodeProperties[] = listPaginationFields(show);

export const getAll: OperationHandler = async function (index) {
	const returnAll = this.getNodeParameter('returnAll', index, false) as boolean;
	const limit = returnAll ? 0 : (this.getNodeParameter('limit', index, 50) as number);

	return lagoApiRequestAllItems<JsonObject>(this, '/billable_metrics', 'billable_metrics', {
		returnAll,
		limit,
		resource: 'Billable Metric',
	});
};
