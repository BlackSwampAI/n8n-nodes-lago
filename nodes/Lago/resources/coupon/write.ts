import type { IDataObject, INodeProperties, JsonObject } from 'n8n-workflow';
import { lagoApiRequest } from '../../shared/transport';
import type { OperationHandler } from '../../shared/types';
import { buildAppliesTo, couponFields } from './fields';

export const createFields: INodeProperties[] = couponFields('create');
export const updateFields: INodeProperties[] = couponFields('update');

/** Reads the coupon body, sending only the fields the chosen type and frequency make valid. */
function readCoupon(
	get: (name: string, fallback?: unknown) => unknown,
	options: { includeName: boolean },
): IDataObject {
	const couponType = get('couponType', 'fixed_amount') as string;
	const frequency = get('frequency', 'once') as string;
	const expiration = get('expiration', 'no_expiration') as string;
	const additionalFields = (get('additionalFields', {}) ?? {}) as IDataObject;

	const coupon: IDataObject = {
		code: get('code') as string,
		coupon_type: couponType,
		frequency,
		expiration,
	};

	if (options.includeName) coupon.name = get('name') as string;

	if (couponType === 'fixed_amount') {
		coupon.amount_cents = Number(get('amountCents', 0));
		coupon.amount_currency = get('amountCurrency', 'USD') as string;
	} else {
		coupon.percentage_rate = String(get('percentageRate', '') ?? '').trim();
	}

	if (frequency === 'recurring') coupon.frequency_duration = Number(get('frequencyDuration', 1));

	if (expiration === 'time_limit') {
		const expirationAt = get('expirationAt', '') as string;
		if (expirationAt) coupon.expiration_at = new Date(expirationAt).toISOString();
	}

	if (additionalFields.reusable !== undefined) coupon.reusable = additionalFields.reusable;

	const appliesTo = buildAppliesTo(additionalFields);
	if (appliesTo) coupon.applies_to = appliesTo;

	return coupon;
}

export const create: OperationHandler = async function (index) {
	const get = (name: string, fallback?: unknown) => this.getNodeParameter(name, index, fallback);
	const coupon = readCoupon(get, { includeName: true });

	const response = await lagoApiRequest.call(this, 'POST', '/coupons', {
		body: { coupon },
		resource: 'Coupon',
		resourceId: String(coupon.code),
	});

	return response.coupon as JsonObject;
};

export const update: OperationHandler = async function (index) {
	const get = (name: string, fallback?: unknown) => this.getNodeParameter(name, index, fallback);
	const coupon = readCoupon(get, { includeName: false });
	const code = String(coupon.code);

	const response = await lagoApiRequest.call(this, 'PUT', `/coupons/${encodeURIComponent(code)}`, {
		body: { coupon },
		resource: 'Coupon',
		resourceId: code,
	});

	return response.coupon as JsonObject;
};
