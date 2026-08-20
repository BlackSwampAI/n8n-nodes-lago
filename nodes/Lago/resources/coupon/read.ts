import type { INodeProperties, JsonObject } from 'n8n-workflow';
import { lagoApiRequest, lagoApiRequestAllItems } from '../../shared/transport';
import { listPaginationFields } from '../../shared/descriptions';
import type { OperationHandler } from '../../shared/types';

const listShow = { resource: ['coupon'], operation: ['getAll'] };

/** The coupon code field, for operations that address a single coupon. */
export function couponCodeField(operation: string): INodeProperties {
	return {
		displayName: 'Code',
		name: 'code',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. launch10',
		displayOptions: { show: { resource: ['coupon'], operation: [operation] } },
	};
}

export const getAllFields: INodeProperties[] = listPaginationFields(listShow);

export const get: OperationHandler = async function (index) {
	const code = this.getNodeParameter('code', index) as string;

	const response = await lagoApiRequest.call(this, 'GET', `/coupons/${encodeURIComponent(code)}`, {
		resource: 'Coupon',
		resourceId: code,
	});

	return response.coupon as JsonObject;
};

export const getAll: OperationHandler = async function (index) {
	const returnAll = this.getNodeParameter('returnAll', index, false) as boolean;
	const limit = returnAll ? 0 : (this.getNodeParameter('limit', index, 50) as number);

	return lagoApiRequestAllItems<JsonObject>(this, '/coupons', 'coupons', {
		returnAll,
		limit,
		resource: 'Coupon',
	});
};

export const remove: OperationHandler = async function (index) {
	const code = this.getNodeParameter('code', index) as string;

	const response = await lagoApiRequest.call(
		this,
		'DELETE',
		`/coupons/${encodeURIComponent(code)}`,
		{ resource: 'Coupon', resourceId: code },
	);

	return response.coupon as JsonObject;
};
