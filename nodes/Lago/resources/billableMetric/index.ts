import type { INodeProperties } from 'n8n-workflow';
import type { OperationHandlers } from '../../shared/types';
import { create, createFields } from './create';
import { evaluateExpression, evaluateExpressionFields } from './evaluateExpression';
import { get, getFields } from './get';
import { getAll, getAllFields } from './getAll';
import { remove, removeFields } from './remove';
import { update, updateFields } from './update';

const showOnlyForBillableMetrics = { resource: ['billableMetric'] };

export const billableMetricDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		default: 'create',
		displayOptions: { show: showOnlyForBillableMetrics },
		options: [
			{
				name: 'Create',
				value: 'create',
				action: 'Create a billable metric',
				description: 'Create a billable metric',
			},
			{
				name: 'Delete',
				value: 'delete',
				action: 'Delete a billable metric',
				description: 'Delete a billable metric',
			},
			{
				name: 'Evaluate Expression',
				value: 'evaluateExpression',
				action: 'Evaluate a billable metric expression',
				description: 'Check an expression against a sample event before saving it to a metric',
			},
			{
				name: 'Get',
				value: 'get',
				action: 'Get a billable metric',
				description: 'Retrieve a single billable metric',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many billable metrics',
				description: 'Retrieve many billable metrics',
			},
			{
				name: 'Update',
				value: 'update',
				action: 'Update a billable metric',
				description: 'Update a billable metric',
			},
		],
	},
	...createFields,
	...updateFields,
	...getFields,
	...getAllFields,
	...removeFields,
	...evaluateExpressionFields,
];

export const billableMetricOperations: OperationHandlers = {
	create,
	update,
	get,
	getAll,
	delete: remove,
	evaluateExpression,
};
