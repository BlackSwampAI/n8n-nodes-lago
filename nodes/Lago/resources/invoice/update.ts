import type { IDataObject, INodeProperties, JsonObject } from 'n8n-workflow';
import { lagoApiRequest } from '../../shared/transport';
import type { OperationHandler } from '../../shared/types';
import { invoiceIdField } from './lifecycle';
import { PAYMENT_STATUSES } from './getAll';

const show = { resource: ['invoice'], operation: ['update'] };

export const updateFields: INodeProperties[] = [
	invoiceIdField('update'),
	{
		displayName: 'Update Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show },
		options: [
			{
				displayName: 'Payment Status',
				name: 'payment_status',
				type: 'options',
				default: 'succeeded',
				description: 'Record payment outcome when collecting outside Lago',
				options: PAYMENT_STATUSES,
			},
		],
	},
	{
		displayName: 'Metadata',
		name: 'metadata',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		placeholder: 'Add Metadata',
		default: {},
		displayOptions: { show },
		options: [
			{
				displayName: 'Metadata',
				name: 'metadata',
				values: [
					{ displayName: 'Key', name: 'key', type: 'string', default: '' },
					{ displayName: 'Value', name: 'value', type: 'string', default: '' },
				],
			},
		],
	},
];

export const update: OperationHandler = async function (index) {
	const invoiceId = this.getNodeParameter('invoiceId', index) as string;
	const additionalFields = this.getNodeParameter('additionalFields', index, {}) as IDataObject;
	const metadata = this.getNodeParameter('metadata.metadata', index, []) as IDataObject[];

	const invoice: IDataObject = { ...additionalFields };
	if (metadata.length > 0) {
		invoice.metadata = metadata.map((entry) => ({ key: entry.key, value: entry.value }));
	}

	const response = await lagoApiRequest.call(
		this,
		'PUT',
		`/invoices/${encodeURIComponent(invoiceId)}`,
		{ body: { invoice }, resource: 'Invoice', resourceId: invoiceId },
	);

	return response.invoice as JsonObject;
};
