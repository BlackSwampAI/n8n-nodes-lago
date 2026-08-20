import type { INodeProperties } from 'n8n-workflow';
import type { OperationHandlers } from '../../shared/types';
import {
	apply,
	applyFields,
	getAllApplied,
	getAllAppliedFields,
	removeApplied,
	removeAppliedFields,
} from './applied';
import { couponCodeField, get, getAll, getAllFields, remove } from './read';
import { create, createFields, update, updateFields } from './write';

const showOnlyForCoupons = { resource: ['coupon'] };

export const couponDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		default: 'create',
		displayOptions: { show: showOnlyForCoupons },
		options: [
			{
				name: 'Apply to Customer',
				value: 'apply',
				action: 'Apply a coupon to a customer',
				description: 'Give a customer a coupon, optionally on different terms',
			},
			{
				name: 'Create',
				value: 'create',
				action: 'Create a coupon',
				description: 'Define a coupon',
			},
			{
				name: 'Delete',
				value: 'delete',
				action: 'Delete a coupon',
				description: 'Delete a coupon',
			},
			{
				name: 'Get',
				value: 'get',
				action: 'Get a coupon',
				description: 'Retrieve a single coupon',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many coupons',
				description: 'Retrieve many coupons',
			},
			{
				name: 'Get Many Applied',
				value: 'getAllApplied',
				action: 'Get many applied coupons',
				// The applied coupon is a separate record from the coupon it came from.
				description: 'Retrieve coupons that have been given to customers',
			},
			{
				name: 'Remove From Customer',
				value: 'removeApplied',
				action: 'Remove an applied coupon',
				description: 'Take a coupon back from a customer',
			},
			{
				name: 'Update',
				value: 'update',
				action: 'Update a coupon',
				description: 'Update a coupon',
			},
		],
	},
	...createFields,
	...updateFields,
	...getAllFields,
	...applyFields,
	...getAllAppliedFields,
	...removeAppliedFields,
	couponCodeField('get'),
	couponCodeField('delete'),
];

export const couponOperations: OperationHandlers = {
	create,
	update,
	get,
	getAll,
	delete: remove,
	apply,
	getAllApplied,
	removeApplied,
};
