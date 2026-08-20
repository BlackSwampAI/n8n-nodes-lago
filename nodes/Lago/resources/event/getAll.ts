import type { IDataObject, INodeProperties, JsonObject } from 'n8n-workflow';
import { lagoApiRequestAllItems } from '../../shared/transport';
import { listPaginationFields } from '../../shared/descriptions';
import type { OperationHandler } from '../../shared/types';

const show = { resource: ['event'], operation: ['getAll'] };

export const getAllFields: INodeProperties[] = [
	...listPaginationFields(show),
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show },
		options: [
			{
				displayName: 'Billable Metric Name or ID',
				name: 'code',
				type: 'options',
				description:
					'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
				typeOptions: { loadOptionsMethod: 'getBillableMetricCodes' },
				default: '',
			},
			{
				displayName: 'External Subscription ID',
				name: 'external_subscription_id',
				type: 'string',
				default: '',
			},
			{
				displayName: 'Timestamp From',
				name: 'timestamp_from',
				type: 'dateTime',
				default: '',
			},
			{
				displayName: 'Timestamp To',
				name: 'timestamp_to',
				type: 'dateTime',
				default: '',
			},
		],
	},
];

export const getAll: OperationHandler = async function (index) {
	const returnAll = this.getNodeParameter('returnAll', index, false) as boolean;
	const limit = returnAll ? 0 : (this.getNodeParameter('limit', index, 50) as number);
	const filters = this.getNodeParameter('filters', index, {}) as IDataObject;

	return lagoApiRequestAllItems<JsonObject>(this, '/events', 'events', {
		returnAll,
		limit,
		query: { ...filters },
		resource: 'Event',
	});
};
