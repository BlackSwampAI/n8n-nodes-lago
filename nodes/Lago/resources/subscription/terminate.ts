import type { IDataObject, INodeProperties, JsonObject } from 'n8n-workflow';
import { lagoApiRequest } from '../../shared/transport';
import type { OperationHandler } from '../../shared/types';

const show = { resource: ['subscription'], operation: ['terminate'] };

export const terminateFields: INodeProperties[] = [
	{
		displayName: 'Subscription External ID',
		name: 'externalId',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. acme-corp-starter',
		displayOptions: { show },
	},
	{
		displayName: 'Status',
		name: 'status',
		type: 'options',
		default: 'active',
		// The same external ID can identify both a live subscription and a pending upgrade, so
		// Lago needs to be told which one to end. Without this a pending subscription cannot be
		// cancelled through the node at all.
		description:
			'Which subscription to end when the external ID matches more than one. Use Pending to cancel a scheduled upgrade or downgrade rather than ending the live subscription.',
		options: [
			{ name: 'Active', value: 'active' },
			{ name: 'Pending', value: 'pending' },
		],
		displayOptions: { show },
	},
];

export const terminate: OperationHandler = async function (index) {
	const externalId = this.getNodeParameter('externalId', index) as string;
	const status = this.getNodeParameter('status', index, 'active') as string;

	const query: IDataObject = status === 'active' ? {} : { status };

	const response = await lagoApiRequest.call(
		this,
		'DELETE',
		`/subscriptions/${encodeURIComponent(externalId)}`,
		{ query, resource: 'Subscription', resourceId: externalId },
	);

	return response.subscription as JsonObject;
};
