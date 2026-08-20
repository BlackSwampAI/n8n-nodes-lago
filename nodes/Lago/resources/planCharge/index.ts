import type { INodeProperties } from 'n8n-workflow';
import type { OperationHandlers } from '../../shared/types';
import { create, createFields } from './create';
import { get, getFields } from './get';
import { getAll, getAllFields } from './getAll';
import { remove, removeFields } from './remove';
import { update, updateFields } from './update';

const showOnlyForPlanCharges = { resource: ['planCharge'] };

export const planChargeDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		default: 'create',
		displayOptions: { show: showOnlyForPlanCharges },
		options: [
			{
				name: 'Create',
				value: 'create',
				action: 'Add a charge to a plan',
				description: 'Price a billable metric on a plan',
			},
			{
				name: 'Delete',
				value: 'delete',
				action: 'Delete a plan charge',
				description: 'Remove a charge from a plan',
			},
			{
				name: 'Get',
				value: 'get',
				action: 'Get a plan charge',
				description: 'Retrieve a single charge',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many plan charges',
				description: 'Retrieve the charges on a plan',
			},
			{
				name: 'Update',
				value: 'update',
				action: 'Update a plan charge',
				description: 'Update a charge on a plan',
			},
		],
	},
	...createFields,
	...updateFields,
	...getFields,
	...getAllFields,
	...removeFields,
];

export const planChargeOperations: OperationHandlers = {
	create,
	update,
	get,
	getAll,
	delete: remove,
};
