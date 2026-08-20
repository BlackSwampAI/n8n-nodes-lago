import type { IDataObject, INodeProperties, JsonObject } from 'n8n-workflow';
import { lagoApiRequestAllItems } from '../../shared/transport';
import { listPaginationFields } from '../../shared/descriptions';
import type { OperationHandler } from '../../shared/types';

const show = { resource: ['invoice'], operation: ['getAll'] };

export const INVOICE_STATUSES = [
	{ name: 'Draft', value: 'draft' },
	{ name: 'Finalized', value: 'finalized' },
	{ name: 'Voided', value: 'voided' },
	{ name: 'Failed', value: 'failed' },
	{ name: 'Pending', value: 'pending' },
];

export const PAYMENT_STATUSES = [
	{ name: 'Pending', value: 'pending' },
	{ name: 'Succeeded', value: 'succeeded' },
	{ name: 'Failed', value: 'failed' },
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
				displayName: 'Currency',
				name: 'currency',
				type: 'string',
				default: '',
				placeholder: 'e.g. USD',
			},
			{
				displayName: 'Customer External ID',
				name: 'external_customer_id',
				type: 'string',
				default: '',
			},
			{
				displayName: 'Issuing Date From',
				name: 'issuing_date_from',
				type: 'dateTime',
				default: '',
			},
			{
				displayName: 'Issuing Date To',
				name: 'issuing_date_to',
				type: 'dateTime',
				default: '',
			},
			{
				displayName: 'Payment Status',
				name: 'payment_status',
				type: 'options',
				default: 'pending',
				options: PAYMENT_STATUSES,
			},
			{
				displayName: 'Status',
				name: 'status',
				type: 'options',
				default: 'finalized',
				options: INVOICE_STATUSES,
			},
		],
	},
];

export const getAll: OperationHandler = async function (index) {
	const returnAll = this.getNodeParameter('returnAll', index, false) as boolean;
	const limit = returnAll ? 0 : (this.getNodeParameter('limit', index, 50) as number);
	const filters = this.getNodeParameter('filters', index, {}) as IDataObject;

	return lagoApiRequestAllItems<JsonObject>(this, '/invoices', 'invoices', {
		returnAll,
		limit,
		query: { ...filters },
		resource: 'Invoice',
	});
};
