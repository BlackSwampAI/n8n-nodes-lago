import type { IDataObject, INodeProperties, JsonObject } from 'n8n-workflow';
import { lagoApiRequest, lagoApiRequestAllItems } from '../../shared/transport';
import { listPaginationFields } from '../../shared/descriptions';
import type { OperationHandler } from '../../shared/types';

const show = { resource: ['creditNote'], operation: ['getAll'] };

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
			},
			{
				displayName: 'Invoice Number',
				name: 'invoice_number',
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
		],
	},
];

export const get: OperationHandler = async function (index) {
	const creditNoteId = this.getNodeParameter('creditNoteId', index) as string;

	const response = await lagoApiRequest.call(
		this,
		'GET',
		`/credit_notes/${encodeURIComponent(creditNoteId)}`,
		{ resource: 'Credit Note', resourceId: creditNoteId },
	);

	return response.credit_note as JsonObject;
};

export const getAll: OperationHandler = async function (index) {
	const returnAll = this.getNodeParameter('returnAll', index, false) as boolean;
	const limit = returnAll ? 0 : (this.getNodeParameter('limit', index, 50) as number);
	const filters = this.getNodeParameter('filters', index, {}) as IDataObject;

	return lagoApiRequestAllItems<JsonObject>(this, '/credit_notes', 'credit_notes', {
		returnAll,
		limit,
		query: { ...filters },
		resource: 'Credit Note',
	});
};

/**
 * Renders the credit note PDF.
 *
 * Asynchronous in the same way invoice download is: the first call queues the render and answers
 * with an empty body, so the record is read back rather than returned from that response.
 */
export const download: OperationHandler = async function (index) {
	const creditNoteId = this.getNodeParameter('creditNoteId', index) as string;

	const response = await lagoApiRequest.call(
		this,
		'POST',
		`/credit_notes/${encodeURIComponent(creditNoteId)}/download`,
		{ resource: 'Credit Note', resourceId: creditNoteId },
	);

	if (response?.credit_note) return response.credit_note as JsonObject;

	const current = await lagoApiRequest.call(
		this,
		'GET',
		`/credit_notes/${encodeURIComponent(creditNoteId)}`,
		{ resource: 'Credit Note', resourceId: creditNoteId },
	);
	return current.credit_note as JsonObject;
};

export const voidCreditNote: OperationHandler = async function (index) {
	const creditNoteId = this.getNodeParameter('creditNoteId', index) as string;

	const response = await lagoApiRequest.call(
		this,
		'PUT',
		`/credit_notes/${encodeURIComponent(creditNoteId)}/void`,
		{ resource: 'Credit Note', resourceId: creditNoteId },
	);

	return response.credit_note as JsonObject;
};
