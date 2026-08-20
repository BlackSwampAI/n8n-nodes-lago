import type { INodeProperties, JsonObject } from 'n8n-workflow';
import { lagoApiRequest } from '../../shared/transport';
import type { OperationHandler } from '../../shared/types';

const show = { resource: ['event'], operation: ['get'] };

export const getFields: INodeProperties[] = [
	{
		displayName: 'Transaction ID',
		name: 'transactionId',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. invoice-4821-line-3',
		displayOptions: { show },
	},
];

export const get: OperationHandler = async function (index) {
	const transactionId = this.getNodeParameter('transactionId', index) as string;

	const response = await lagoApiRequest.call(
		this,
		'GET',
		`/events/${encodeURIComponent(transactionId)}`,
		{ resource: 'Event', resourceId: transactionId },
	);

	return response.event as JsonObject;
};
