import type { INodeProperties } from 'n8n-workflow';

export const CREDIT_NOTE_REASONS = [
	{ name: 'Duplicated Charge', value: 'duplicated_charge' },
	{ name: 'Fraudulent Charge', value: 'fraudulent_charge' },
	{ name: 'Order Cancellation', value: 'order_cancellation' },
	{ name: 'Order Change', value: 'order_change' },
	{ name: 'Other', value: 'other' },
	{ name: 'Product Unsatisfactory', value: 'product_unsatisfactory' },
];

/** Lago addresses credit notes by its own UUID, as it does invoices. */
export function creditNoteIdField(operation: string): INodeProperties {
	return {
		displayName: 'Credit Note ID',
		name: 'creditNoteId',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. 1a901a90-1a90-1a90-1a90-1a901a901a90',
		description: 'Lago’s internal ID for the credit note, returned as lago_id by Get Many',
		displayOptions: { show: { resource: ['creditNote'], operation: [operation] } },
	};
}
