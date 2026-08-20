import type { INodeProperties, JsonObject } from 'n8n-workflow';
import { lagoApiRequest } from '../../shared/transport';
import type { OperationHandler } from '../../shared/types';

const show = { resource: ['subscription'], operation: ['get'] };

export const getFields: INodeProperties[] = [
	{
		displayName: 'Subscription External ID',
		name: 'externalId',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. acme-corp-starter',
		displayOptions: { show },
	},
];

export const get: OperationHandler = async function (index) {
	const externalId = this.getNodeParameter('externalId', index) as string;

	const response = await lagoApiRequest.call(
		this,
		'GET',
		`/subscriptions/${encodeURIComponent(externalId)}`,
		{ resource: 'Subscription', resourceId: externalId },
	);

	return response.subscription as JsonObject;
};
