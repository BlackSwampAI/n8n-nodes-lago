import type { INodeProperties, JsonObject } from 'n8n-workflow';
import { lagoApiRequest } from '../../shared/transport';
import type { OperationHandler } from '../../shared/types';

/**
 * Invoices are addressed by Lago's own UUID, not by a code.
 *
 * Every other resource in this node is addressed by something the workflow author chose. Invoices
 * are not, so the field says where the value comes from.
 */
export function invoiceIdField(operation: string): INodeProperties {
	return {
		displayName: 'Invoice ID',
		name: 'invoiceId',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. 1a901a90-1a90-1a90-1a90-1a901a901a90',
		description: 'Lago’s internal ID for the invoice, returned as lago_id by Get Many',
		displayOptions: { show: { resource: ['invoice'], operation: [operation] } },
	};
}

/** Builds a handler for one of Lago's invoice lifecycle actions. */
function lifecycleAction(method: 'POST' | 'PUT', action: string): OperationHandler {
	return async function (index) {
		const invoiceId = this.getNodeParameter('invoiceId', index) as string;

		const response = await lagoApiRequest.call(
			this,
			method,
			`/invoices/${encodeURIComponent(invoiceId)}/${action}`,
			{ resource: 'Invoice', resourceId: invoiceId },
		);

		return (response.invoice ?? response) as JsonObject;
	};
}

export const get: OperationHandler = async function (index) {
	const invoiceId = this.getNodeParameter('invoiceId', index) as string;

	const response = await lagoApiRequest.call(
		this,
		'GET',
		`/invoices/${encodeURIComponent(invoiceId)}`,
		{ resource: 'Invoice', resourceId: invoiceId },
	);

	return response.invoice as JsonObject;
};

export const finalize = lifecycleAction('PUT', 'finalize');
export const voidInvoice = lifecycleAction('POST', 'void');
export const retryPayment = lifecycleAction('POST', 'retry_payment');

/**
 * Asks Lago to render the invoice PDF.
 *
 * Rendering is asynchronous. The first call queues the job and answers with an empty body, so
 * `file_url` is only present on a later call — which is why the result is read back rather than
 * returned straight from the download response.
 */
export const download: OperationHandler = async function (index) {
	const invoiceId = this.getNodeParameter('invoiceId', index) as string;

	const response = await lagoApiRequest.call(
		this,
		'POST',
		`/invoices/${encodeURIComponent(invoiceId)}/download`,
		{ resource: 'Invoice', resourceId: invoiceId },
	);

	if (response?.invoice) return response.invoice as JsonObject;

	// Empty body means the render was queued rather than already done. Return the invoice as it
	// stands so the caller gets a usable record, with file_url filled in once the job completes.
	const current = await lagoApiRequest.call(
		this,
		'GET',
		`/invoices/${encodeURIComponent(invoiceId)}`,
		{ resource: 'Invoice', resourceId: invoiceId },
	);
	return current.invoice as JsonObject;
};
