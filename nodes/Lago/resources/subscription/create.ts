import type { IDataObject, INodeProperties, JsonObject } from 'n8n-workflow';
import { lagoApiRequest } from '../../shared/transport';
import type { OperationHandler } from '../../shared/types';

const show = { resource: ['subscription'], operation: ['create'] };

export const BILLING_TIMES = [
	{
		name: 'Calendar',
		value: 'calendar',
		description: 'Bill on the first day of the period, prorating the first invoice',
	},
	{
		name: 'Anniversary',
		value: 'anniversary',
		description: 'Bill on the subscription start date each period, with no proration',
	},
];

export const createFields: INodeProperties[] = [
	{
		displayName: 'Customer External ID',
		name: 'externalCustomerId',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. acme-corp',
		description: 'Your own identifier for the customer to subscribe',
		displayOptions: { show },
	},
	{
		displayName: 'Plan Code',
		name: 'planCode',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. starter',
		description: 'Code of the plan to attach',
		displayOptions: { show },
	},
	{
		displayName: 'Subscription External ID',
		name: 'externalId',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. acme-corp-starter',
		// Lago treats this as an idempotency key, so the same value cannot be reused for a second
		// concurrent subscription. Saying so here is cheaper than a 422 later.
		description:
			'Your own identifier for this subscription. Lago uses it as an idempotency key, so it must be unique among the customer’s live subscriptions.',
		displayOptions: { show },
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show },
		options: [
			{
				displayName: 'Billing Entity Code',
				name: 'billing_entity_code',
				type: 'string',
				default: '',
				description: 'Billing entity to bill through. Defaults to the organization’s own.',
			},
			{
				displayName: 'Billing Time',
				name: 'billing_time',
				type: 'options',
				default: 'calendar',
				description: 'When each billing period starts, and whether the first one is prorated',
				options: BILLING_TIMES,
			},
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
				description:
					'Display name on invoices. Useful when one customer holds several subscriptions to the same plan.',
			},
			{
				displayName: 'Subscription At',
				name: 'subscription_at',
				type: 'dateTime',
				default: '',
				description:
					'When the subscription starts. May be in the past or future. Cannot be used to reschedule a pending subscription.',
			},
		],
	},
];

export const create: OperationHandler = async function (index) {
	const externalId = this.getNodeParameter('externalId', index) as string;
	const additionalFields = this.getNodeParameter('additionalFields', index, {}) as IDataObject;

	const subscription: IDataObject = {
		external_customer_id: this.getNodeParameter('externalCustomerId', index) as string,
		plan_code: this.getNodeParameter('planCode', index) as string,
		external_id: externalId,
		...additionalFields,
	};

	const response = await lagoApiRequest.call(this, 'POST', '/subscriptions', {
		body: { subscription },
		resource: 'Subscription',
		resourceId: externalId,
	});

	return response.subscription as JsonObject;
};
