import type { IDataObject, INodeProperties, JsonObject } from 'n8n-workflow';
import { lagoApiRequest } from '../../shared/transport';
import type { OperationHandler } from '../../shared/types';

const show = { resource: ['subscription'], operation: ['update'] };

export const updateFields: INodeProperties[] = [
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
		displayName: 'Update Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show },
		options: [
			{
				displayName: 'Ending At',
				name: 'ending_at',
				type: 'dateTime',
				default: '',
				description: 'When the subscription should end. Leave empty to renew indefinitely.',
			},
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
				description: 'Display name on invoices',
			},
			{
				displayName: 'Subscription At',
				name: 'subscription_at',
				type: 'dateTime',
				default: '',
				description: 'Start date. Only settable while the subscription is still pending.',
			},
		],
	},
];

export const update: OperationHandler = async function (index) {
	const externalId = this.getNodeParameter('externalId', index) as string;
	const additionalFields = this.getNodeParameter('additionalFields', index, {}) as IDataObject;

	const response = await lagoApiRequest.call(
		this,
		'PUT',
		`/subscriptions/${encodeURIComponent(externalId)}`,
		{
			body: { subscription: { ...additionalFields } },
			resource: 'Subscription',
			resourceId: externalId,
		},
	);

	return response.subscription as JsonObject;
};
