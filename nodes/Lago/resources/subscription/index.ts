import type { INodeProperties } from 'n8n-workflow';
import type { OperationHandlers } from '../../shared/types';
import { create, createFields } from './create';
import { get, getFields } from './get';
import { getAll, getAllFields } from './getAll';
import { terminate, terminateFields } from './terminate';
import { update, updateFields } from './update';

const showOnlyForSubscriptions = { resource: ['subscription'] };

export const subscriptionDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		default: 'create',
		displayOptions: { show: showOnlyForSubscriptions },
		options: [
			{
				name: 'Create',
				value: 'create',
				action: 'Create a subscription',
				// Sending the same external ID with a different plan is how Lago models a plan
				// change, so this operation is not create-only and the description should not
				// imply that it is.
				description:
					'Subscribe a customer to a plan. Sending the same external ID with a different plan upgrades immediately, or schedules a downgrade for the end of the period.',
			},
			{
				name: 'Get',
				value: 'get',
				action: 'Get a subscription',
				description:
					'Retrieve a single subscription. A terminated subscription reports as not found here, but is still returned by Get Many with the terminated status selected.',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many subscriptions',
				description: 'Retrieve many subscriptions',
			},
			{
				name: 'Terminate',
				value: 'terminate',
				action: 'Terminate a subscription',
				// Named for what Lago does rather than for the HTTP verb: DELETE ends the
				// subscription and keeps it, with its invoices, as a terminated record.
				description:
					'End a subscription. The record is kept with a terminated status rather than removed.',
			},
			{
				name: 'Update',
				value: 'update',
				action: 'Update a subscription',
				description: 'Update a subscription',
			},
		],
	},
	...createFields,
	...getFields,
	...getAllFields,
	...updateFields,
	...terminateFields,
];

export const subscriptionOperations: OperationHandlers = {
	create,
	get,
	getAll,
	update,
	terminate,
};
