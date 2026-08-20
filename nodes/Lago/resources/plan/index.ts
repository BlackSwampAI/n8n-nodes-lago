import type { INodeProperties } from 'n8n-workflow';
import type { OperationHandlers } from '../../shared/types';
import { create, createFields } from './create';
import { get, getFields } from './get';
import { getAll, getAllFields } from './getAll';
import { remove, removeFields } from './remove';
import { update, updateFields } from './update';

const showOnlyForPlans = { resource: ['plan'] };

export const planDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		default: 'create',
		displayOptions: { show: showOnlyForPlans },
		options: [
			{ name: 'Create', value: 'create', action: 'Create a plan', description: 'Create a plan' },
			{
				name: 'Delete',
				value: 'delete',
				action: 'Delete a plan',
				// Lago queues the deletion rather than performing it inline, so the plan stays
				// readable — through Get and Get Many — until the background job runs.
				description:
					'Delete a plan. Lago processes this asynchronously, so the plan stays readable for a moment afterwards.',
			},
			{ name: 'Get', value: 'get', action: 'Get a plan', description: 'Retrieve a single plan' },
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many plans',
				description: 'Retrieve many plans',
			},
			{ name: 'Update', value: 'update', action: 'Update a plan', description: 'Update a plan' },
		],
	},
	...createFields,
	...updateFields,
	...getFields,
	...getAllFields,
	...removeFields,
];

export const planOperations: OperationHandlers = {
	create,
	update,
	get,
	getAll,
	delete: remove,
};
