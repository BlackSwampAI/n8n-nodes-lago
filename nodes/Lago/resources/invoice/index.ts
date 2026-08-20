import type { INodeProperties } from 'n8n-workflow';
import type { OperationHandlers } from '../../shared/types';
import { create, createFields } from './create';
import { getAll, getAllFields } from './getAll';
import { download, finalize, get, invoiceIdField, retryPayment, voidInvoice } from './lifecycle';
import { update, updateFields } from './update';

const showOnlyForInvoices = { resource: ['invoice'] };

export const invoiceDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		default: 'getAll',
		displayOptions: { show: showOnlyForInvoices },
		options: [
			{
				name: 'Create One-Off',
				value: 'create',
				action: 'Create a one off invoice',
				// One-off invoices are issued finalized, unlike invoices generated from a billing
				// period, so there is no draft stage to finalize afterwards.
				description:
					'Bill a customer directly from add-ons. The invoice is issued already finalized.',
			},
			{
				name: 'Download',
				value: 'download',
				action: 'Download an invoice PDF',
				description:
					'Render the invoice PDF and return the invoice. Rendering is asynchronous, so file_url may still be empty on the first call.',
			},
			{
				name: 'Finalize',
				value: 'finalize',
				action: 'Finalize a draft invoice',
				// Lago answers 404 invoice_not_found for an invoice that is already finalized, which
				// reads as though it does not exist.
				description:
					'Issue a draft invoice. Only drafts can be finalized — Lago reports an already-finalized invoice as not found. Drafts require an invoice grace period, which is a premium feature.',
			},
			{
				name: 'Get',
				value: 'get',
				action: 'Get an invoice',
				description: 'Retrieve a single invoice',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many invoices',
				description: 'Retrieve many invoices',
			},
			{
				name: 'Retry Payment',
				value: 'retryPayment',
				action: 'Retry collecting payment',
				description: 'Ask Lago to attempt payment collection again',
			},
			{
				name: 'Update',
				value: 'update',
				action: 'Update an invoice',
				description: 'Record a payment status or metadata against an invoice',
			},
			{
				name: 'Void',
				value: 'void',
				action: 'Void an invoice',
				description: 'Cancel a finalized invoice. The record is kept with a voided status.',
			},
		],
	},
	...createFields,
	...getAllFields,
	...updateFields,
	invoiceIdField('get'),
	invoiceIdField('finalize'),
	invoiceIdField('void'),
	invoiceIdField('download'),
	invoiceIdField('retryPayment'),
];

export const invoiceOperations: OperationHandlers = {
	create,
	get,
	getAll,
	update,
	finalize,
	void: voidInvoice,
	download,
	retryPayment,
};
