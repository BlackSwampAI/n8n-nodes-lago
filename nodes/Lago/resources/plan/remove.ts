import type { INodeProperties, JsonObject } from 'n8n-workflow';
import { lagoApiRequest } from '../../shared/transport';
import type { OperationHandler } from '../../shared/types';

const show = { resource: ['plan'], operation: ['delete'] };

export const removeFields: INodeProperties[] = [
	{
		displayName: 'Code',
		name: 'code',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. startup',
		displayOptions: { show },
	},
];

export const remove: OperationHandler = async function (index) {
	const code = this.getNodeParameter('code', index) as string;

	const response = await lagoApiRequest.call(this, 'DELETE', `/plans/${encodeURIComponent(code)}`, {
		resource: 'Plan',
		resourceId: code,
	});

	return response.plan as JsonObject;
};
