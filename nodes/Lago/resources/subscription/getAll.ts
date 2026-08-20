import type { IDataObject, INodeProperties, JsonObject } from 'n8n-workflow';
import { lagoApiRequestAllItems } from '../../shared/transport';
import { listPaginationFields } from '../../shared/descriptions';
import type { OperationHandler } from '../../shared/types';

const show = { resource: ['subscription'], operation: ['getAll'] };

export const SUBSCRIPTION_STATUSES = [
	{ name: 'Active', value: 'active' },
	{ name: 'Pending', value: 'pending' },
	{ name: 'Terminated', value: 'terminated' },
	{ name: 'Canceled', value: 'canceled' },
];

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
				displayName: 'Customer External ID',
				name: 'external_customer_id',
				type: 'string',
				default: '',
				description: 'Return only this customer’s subscriptions',
			},
			{
				displayName: 'Plan Code',
				name: 'plan_code',
				type: 'string',
				default: '',
				description: 'Return only subscriptions on this plan',
			},
			{
				displayName: 'Status',
				name: 'status',
				type: 'multiOptions',
				default: [],
				// Lago returns only active subscriptions when this is omitted, which is easy to
				// mistake for data loss after a termination. The default is spelled out rather than
				// left to the API reference.
				description:
					'Statuses to include. Lago returns only active subscriptions when this is left empty, so a terminated subscription will not appear unless it is selected here.',
				options: SUBSCRIPTION_STATUSES,
			},
		],
	},
];

export const getAll: OperationHandler = async function (index) {
	const returnAll = this.getNodeParameter('returnAll', index, false) as boolean;
	const limit = returnAll ? 0 : (this.getNodeParameter('limit', index, 50) as number);
	const filters = this.getNodeParameter('filters', index, {}) as IDataObject;

	const query: IDataObject = {
		external_customer_id: filters.external_customer_id,
		plan_code: filters.plan_code,
		status: Array.isArray(filters.status) && filters.status.length ? filters.status : undefined,
	};

	return lagoApiRequestAllItems<JsonObject>(this, '/subscriptions', 'subscriptions', {
		returnAll,
		limit,
		query,
		resource: 'Subscription',
	});
};
