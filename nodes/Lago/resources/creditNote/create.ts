import type { IDataObject, INodeProperties, JsonObject } from 'n8n-workflow';
import { lagoApiRequest } from '../../shared/transport';
import type { OperationHandler } from '../../shared/types';
import { CREDIT_NOTE_REASONS } from './fields';

const show = { resource: ['creditNote'], operation: ['create'] };

/** Fields shared by Create and Estimate, which take the same shape. */
function creditNoteInputFields(operation: 'create' | 'estimate'): INodeProperties[] {
	const scoped = { resource: ['creditNote'], operation: [operation] };

	return [
		{
			displayName: 'Invoice ID',
			name: 'invoiceId',
			type: 'string',
			default: '',
			required: true,
			placeholder: 'e.g. 1a901a90-1a90-1a90-1a90-1a901a901a90',
			description: 'Lago ID of the invoice being credited',
			displayOptions: { show: scoped },
		},
		...(operation === 'create'
			? [
					{
						displayName: 'Reason',
						name: 'reason',
						type: 'options' as const,
						default: 'other',
						required: true,
						description: 'Why the credit note is being issued',
						options: CREDIT_NOTE_REASONS,
						displayOptions: { show: scoped },
					},
				]
			: []),
		{
			displayName: 'Items',
			name: 'items',
			type: 'fixedCollection',
			typeOptions: { multipleValues: true },
			placeholder: 'Add Item',
			default: {},
			required: true,
			// A credit note credits specific fee lines, not the invoice as a whole, so each item
			// names the fee it reduces.
			description:
				'Fee lines to credit. Each references a fee on the invoice, whose lago_id comes from the invoice’s fees array.',
			displayOptions: { show: scoped },
			options: [
				{
					displayName: 'Item',
					name: 'item',
					values: [
						{
							displayName: 'Fee ID',
							name: 'fee_id',
							type: 'string',
							default: '',
							description: 'Lago ID of the fee on the invoice',
						},
						{
							displayName: 'Amount (Cents)',
							name: 'amount_cents',
							type: 'number',
							default: 0,
							description: 'Amount to credit in the currency’s smallest unit. 1000 means 10.00.',
						},
					],
				},
			],
		},
		...(operation === 'create'
			? [
					{
						displayName: 'Additional Fields',
						name: 'additionalFields',
						type: 'collection' as const,
						placeholder: 'Add Field',
						default: {},
						displayOptions: { show: scoped },
						options: [
							{
								displayName: 'Credit Amount (Cents)',
								name: 'credit_amount_cents',
								type: 'number' as const,
								default: 0,
								description: 'Portion returned to the customer’s wallet as credit',
							},
							{
								displayName: 'Description',
								name: 'description',
								type: 'string' as const,
								default: '',
							},
							{
								displayName: 'Refund Amount (Cents)',
								name: 'refund_amount_cents',
								type: 'number' as const,
								default: 0,
								description: 'Portion refunded to the customer’s payment method',
							},
						],
					},
				]
			: []),
	];
}

export const createFields: INodeProperties[] = creditNoteInputFields('create');
export const estimateFields: INodeProperties[] = creditNoteInputFields('estimate');

function readItems(rows: IDataObject[]): IDataObject[] {
	return rows.map((row) => ({
		fee_id: row.fee_id,
		amount_cents: Number(row.amount_cents ?? 0),
	}));
}

export const create: OperationHandler = async function (index) {
	const items = readItems(this.getNodeParameter('items.item', index, []) as IDataObject[]);
	const additionalFields = this.getNodeParameter('additionalFields', index, {}) as IDataObject;

	const response = await lagoApiRequest.call(this, 'POST', '/credit_notes', {
		body: {
			credit_note: {
				invoice_id: this.getNodeParameter('invoiceId', index) as string,
				reason: this.getNodeParameter('reason', index) as string,
				items,
				...additionalFields,
			},
		},
		resource: 'Credit Note',
	});

	return response.credit_note as JsonObject;
};

export const estimate: OperationHandler = async function (index) {
	const items = readItems(this.getNodeParameter('items.item', index, []) as IDataObject[]);

	const response = await lagoApiRequest.call(this, 'POST', '/credit_notes/estimate', {
		body: {
			credit_note: {
				invoice_id: this.getNodeParameter('invoiceId', index) as string,
				items,
			},
		},
		resource: 'Credit Note',
	});

	return (response.estimated_credit_note ?? response.credit_note ?? response) as JsonObject;
};

export const showCreate = show;
