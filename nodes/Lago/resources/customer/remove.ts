import type { INodeProperties, JsonObject } from 'n8n-workflow';
import { lagoApiRequest } from '../../shared/transport';
import type { OperationHandler } from '../../shared/types';

const show = { resource: ['customer'], operation: ['delete'] };

export const removeFields: INodeProperties[] = [
	{
		displayName: 'External ID',
		name: 'externalId',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. acme-corp',
		description: 'Your own identifier for the customer, not Lago’s internal ID',
		displayOptions: { show },
	},
];

export const remove: OperationHandler = async function (index) {
	const externalId = this.getNodeParameter('externalId', index) as string;

	const response = await lagoApiRequest.call(
		this,
		'DELETE',
		`/customers/${encodeURIComponent(externalId)}`,
		{ resource: 'Customer', resourceId: externalId },
	);

	return response.customer as JsonObject;
};
