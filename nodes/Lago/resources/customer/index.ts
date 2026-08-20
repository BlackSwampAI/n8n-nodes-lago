import type { INodeProperties } from 'n8n-workflow';
import type { OperationHandlers } from '../../shared/types';
import { createOrUpdate, createOrUpdateFields } from './createOrUpdate';
import { get, getFields } from './get';
import { getAll, getAllFields } from './getAll';
import { remove, removeFields } from './remove';

const showOnlyForCustomers = { resource: ['customer'] };

export const customerDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		default: 'createOrUpdate',
		displayOptions: { show: showOnlyForCustomers },
		options: [
			{
				name: 'Create or Update',
				value: 'createOrUpdate',
				action: 'Create or update a customer',
				// Lago has no customer update endpoint: POST /customers upserts on external_id and
				// PUT /customers/{external_id} does not exist. One operation is offered rather than
				// a Create and an Update that would imply semantics the API does not have.
				description: 'Create a customer, or update it if the external ID already exists',
			},
			{
				name: 'Delete',
				value: 'delete',
				action: 'Delete a customer',
				description: 'Delete a customer',
			},
			{
				name: 'Get',
				value: 'get',
				action: 'Get a customer',
				description: 'Retrieve a single customer',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many customers',
				description: 'Retrieve many customers',
			},
		],
	},
	...createOrUpdateFields,
	...getFields,
	...getAllFields,
	...removeFields,
];

export const customerOperations: OperationHandlers = {
	createOrUpdate,
	get,
	getAll,
	delete: remove,
};
