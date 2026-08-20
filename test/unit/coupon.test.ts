import { describe, expect, it } from 'vitest';
import { Lago } from '../../nodes/Lago/Lago.node';
import {
	buildAppliesTo,
	COUPON_EXPIRATIONS,
	COUPON_FREQUENCIES,
	COUPON_TYPES,
	toCodeList,
} from '../../nodes/Lago/resources/coupon/fields';
import { couponOperations } from '../../nodes/Lago/resources/coupon';

const properties = new Lago().description.properties;

function fieldFor(name: string, operation = 'create') {
	return properties.find(
		(property) =>
			property.name === name &&
			property.displayOptions?.show?.resource?.includes('coupon') &&
			property.displayOptions?.show?.operation?.includes(operation),
	);
}

describe('coupon operations', () => {
	it('covers both the coupon and the applying of it', () => {
		expect(Object.keys(couponOperations).sort()).toEqual([
			'apply',
			'create',
			'delete',
			'get',
			'getAll',
			'getAllApplied',
			'removeApplied',
			'update',
		]);
	});
});

// A coupon's shape depends on three independent choices, and each unlocks a different field.
// Showing them all at once would offer combinations Lago rejects.
describe('conditional fields', () => {
	it.each([
		['amountCents', 'couponType', 'fixed_amount'],
		['amountCurrency', 'couponType', 'fixed_amount'],
		['percentageRate', 'couponType', 'percentage'],
		['frequencyDuration', 'frequency', 'recurring'],
		['expirationAt', 'expiration', 'time_limit'],
	])('shows %s only when %s is %s', (field, driver, value) => {
		expect(fieldFor(field)?.displayOptions?.show?.[driver]).toEqual([value]);
	});

	it('offers every type, frequency and expiration Lago accepts', () => {
		expect(COUPON_TYPES.map((entry) => entry.value)).toEqual(['fixed_amount', 'percentage']);
		expect(COUPON_FREQUENCIES.map((entry) => entry.value)).toEqual([
			'once',
			'recurring',
			'forever',
		]);
		expect(COUPON_EXPIRATIONS.map((entry) => entry.value)).toEqual(['no_expiration', 'time_limit']);
	});

	// Lago answers 422 expiration: value_is_invalid when it is omitted.
	it('requires an expiration choice on create', () => {
		expect(fieldFor('expiration')?.required).toBe(true);
	});

	// Sent as text so a rate survives exactly as typed, as with charge amounts.
	it('types the percentage rate as a string', () => {
		expect(fieldFor('percentageRate')?.type).toBe('string');
	});
});

describe('applied coupons', () => {
	// The applied coupon is a record in its own right, and using the coupon code here fails.
	it('removes by the applied coupon ID and says so', () => {
		const field = fieldFor('appliedCouponId', 'removeApplied');
		expect(field?.required).toBe(true);
		expect(field?.description).toMatch(/not the coupon code/i);
	});

	it('offers overrides when applying, for terms that differ from the coupon', () => {
		const overrides = fieldFor('overrides', 'apply');
		const names = ((overrides?.options ?? []) as Array<{ name: string }>).map(
			(option) => option.name,
		);
		expect(names).toEqual([
			'amount_cents',
			'amount_currency',
			'frequency_duration',
			'percentage_rate',
		]);
	});
});

describe('toCodeList', () => {
	it('splits and trims a comma-separated list', () => {
		expect(toCodeList('starter, growth ')).toEqual(['starter', 'growth']);
	});

	it('returns undefined for nothing usable, so the key is omitted', () => {
		expect(toCodeList('')).toBeUndefined();
		expect(toCodeList(' , ')).toBeUndefined();
		expect(toCodeList(undefined)).toBeUndefined();
	});
});

describe('buildAppliesTo', () => {
	// Omitted entirely when nothing limits the coupon, rather than sent as an empty object.
	it('returns undefined when the coupon is not limited', () => {
		expect(buildAppliesTo({})).toBeUndefined();
		expect(buildAppliesTo({ plan_codes: '', billable_metric_codes: '' })).toBeUndefined();
	});

	it('carries only the limits that were set', () => {
		expect(buildAppliesTo({ plan_codes: 'starter' })).toEqual({ plan_codes: ['starter'] });
		expect(buildAppliesTo({ billable_metric_codes: 'tokens,calls' })).toEqual({
			billable_metric_codes: ['tokens', 'calls'],
		});
	});
});
