import type { INodeProperties } from 'n8n-workflow';
import type { OperationHandlers } from '../../shared/types';
import { create, createFields, estimate, estimateFields } from './create';
import { creditNoteIdField } from './fields';
import { download, get, getAll, getAllFields, voidCreditNote } from './read';

const showOnlyForCreditNotes = { resource: ['creditNote'] };

/** Suffix used on the operations the free edition refuses. */
const PREMIUM = ' Requires a Lago premium licence.';

export const creditNoteDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		default: 'getAll',
		displayOptions: { show: showOnlyForCreditNotes },
		options: [
			{
				name: 'Create',
				value: 'create',
				action: 'Create a credit note',
				// Verified against a live free-edition instance: 403 feature_unavailable.
				description: `Credit specific fee lines on an invoice.${PREMIUM}`,
			},
			{
				name: 'Download',
				value: 'download',
				action: 'Download a credit note PDF',
				description:
					'Render the credit note PDF and return the record. Rendering is asynchronous, so file_url may still be empty on the first call.',
			},
			{
				name: 'Estimate',
				value: 'estimate',
				action: 'Estimate a credit note',
				description: `Calculate what a credit note would come to, without issuing one.${PREMIUM}`,
			},
			{
				name: 'Get',
				value: 'get',
				action: 'Get a credit note',
				description: 'Retrieve a single credit note',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many credit notes',
				description: 'Retrieve many credit notes',
			},
			{
				name: 'Void',
				value: 'void',
				action: 'Void a credit note',
				description: 'Cancel a credit note. The record is kept with a voided status.',
			},
		],
	},
	...createFields,
	...estimateFields,
	...getAllFields,
	creditNoteIdField('get'),
	creditNoteIdField('download'),
	creditNoteIdField('void'),
];

export const creditNoteOperations: OperationHandlers = {
	create,
	estimate,
	get,
	getAll,
	download,
	void: voidCreditNote,
};
