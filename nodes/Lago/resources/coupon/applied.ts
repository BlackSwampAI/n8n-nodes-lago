import type { IDataObject, INodeProperties, JsonObject } from 'n8n-workflow';
import { lagoApiRequest, lagoApiRequestAllItems } from '../../shared/transport';
import { listPaginationFields } from '../../shared/descriptions';
import type { OperationHandler } from '../../shared/types';

const applyShow = { resource: ['coupon'], operation: ['apply'] };
const listShow = { resource: ['coupon'], operation: ['getAllApplied'] };
const removeShow = { resource: ['coupon'], operation: ['removeApplied'] };

export const applyFields: INodeProperties[] = [
	{
		displayName: 'Customer External ID',
		name: 'externalCustomerId',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. acme-corp',
		displayOptions: { show: applyShow },
	},
	{
		displayName: 'Coupon Code',
		name: 'couponCode',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. launch10',
		displayOptions: { show: applyShow },
	},
	{
		displayName: 'Overrides',
		name: 'overrides',
		type: 'collection',
		placeholder: 'Add Override',
		default: {},
		// Applying a coupon may override the terms it was defined with, for this customer only.
		description: 'Values that differ from the coupon’s own terms, for this customer only',
		displayOptions: { show: applyShow },
		options: [
			{
				displayName: 'Amount (Cents)',
				name: 'amount_cents',
				type: 'number',
				default: 0,
			},
			{
				displayName: 'Currency',
				name: 'amount_currency',
				type: 'string',
				default: '',
				placeholder: 'e.g. USD',
			},
			{
				displayName: 'Frequency Duration',
				name: 'frequency_duration',
				type: 'number',
				default: 3,
			},
			{
				displayName: 'Percentage Rate',
				name: 'percentage_rate',
				type: 'string',
				default: '',
				placeholder: 'e.g. 10.0',
			},
		],
	},
];

export const getAllAppliedFields: INodeProperties[] = [
	...listPaginationFields(listShow),
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: listShow },
		options: [
			{
				displayName: 'Customer External ID',
				name: 'external_customer_id',
				type: 'string',
				default: '',
			},
			{
				displayName: 'Status',
				name: 'status',
				type: 'options',
				default: 'active',
				options: [
					{ name: 'Active', value: 'active' },
					{ name: 'Terminated', value: 'terminated' },
				],
			},
		],
	},
];

export const removeAppliedFields: INodeProperties[] = [
	{
		displayName: 'Customer External ID',
		name: 'externalCustomerId',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. acme-corp',
		displayOptions: { show: removeShow },
	},
	{
		displayName: 'Applied Coupon ID',
		name: 'appliedCouponId',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. 1a901a90-1a90-1a90-1a90-1a901a901a90',
		// The applied coupon is a record in its own right, distinct from the coupon itself.
		description:
			'Lago ID of the applied coupon, returned as lago_id by Get Many Applied — not the coupon code',
		displayOptions: { show: removeShow },
	},
];

export const apply: OperationHandler = async function (index) {
	const couponCode = this.getNodeParameter('couponCode', index) as string;
	const overrides = this.getNodeParameter('overrides', index, {}) as IDataObject;

	const response = await lagoApiRequest.call(this, 'POST', '/applied_coupons', {
		body: {
			applied_coupon: {
				external_customer_id: this.getNodeParameter('externalCustomerId', index) as string,
				coupon_code: couponCode,
				...overrides,
			},
		},
		resource: 'Coupon',
		resourceId: couponCode,
	});

	return response.applied_coupon as JsonObject;
};

export const getAllApplied: OperationHandler = async function (index) {
	const returnAll = this.getNodeParameter('returnAll', index, false) as boolean;
	const limit = returnAll ? 0 : (this.getNodeParameter('limit', index, 50) as number);
	const filters = this.getNodeParameter('filters', index, {}) as IDataObject;

	return lagoApiRequestAllItems<JsonObject>(this, '/applied_coupons', 'applied_coupons', {
		returnAll,
		limit,
		query: { ...filters },
		resource: 'Coupon',
	});
};

export const removeApplied: OperationHandler = async function (index) {
	const externalCustomerId = this.getNodeParameter('externalCustomerId', index) as string;
	const appliedCouponId = this.getNodeParameter('appliedCouponId', index) as string;

	const response = await lagoApiRequest.call(
		this,
		'DELETE',
		`/customers/${encodeURIComponent(externalCustomerId)}/applied_coupons/${encodeURIComponent(appliedCouponId)}`,
		{ resource: 'Coupon', resourceId: appliedCouponId },
	);

	return response.applied_coupon as JsonObject;
};
