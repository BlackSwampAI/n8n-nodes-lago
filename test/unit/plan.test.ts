import { describe, expect, it } from 'vitest';
import { Lago } from '../../nodes/Lago/Lago.node';
import {
	INTERVALS_BILLABLE_MONTHLY,
	PLAN_INTERVALS,
	toTaxCodes,
} from '../../nodes/Lago/resources/plan/fields';

const properties = new Lago().description.properties;

function fieldFor(name: string, operation: string) {
	return properties.find(
		(property) =>
			property.name === name &&
			property.displayOptions?.show?.resource?.includes('plan') &&
			property.displayOptions?.show?.operation?.includes(operation),
	);
}

describe('plan intervals', () => {
	it('offers every interval Lago accepts', () => {
		expect(PLAN_INTERVALS.map((interval) => interval.value)).toEqual([
			'weekly',
			'monthly',
			'quarterly',
			'semiannual',
			'yearly',
		]);
	});

	// On shorter intervals Lago accepts bill_charges_monthly and silently drops it, so showing
	// the field there would offer a setting that appears to work and does nothing.
	it('allows monthly charge billing only on the two long intervals', () => {
		expect(INTERVALS_BILLABLE_MONTHLY).toEqual(['semiannual', 'yearly']);
	});

	it('shows Bill Charges Monthly only on those intervals', () => {
		expect(fieldFor('billChargesMonthly', 'create')?.displayOptions?.show?.interval).toEqual(
			INTERVALS_BILLABLE_MONTHLY,
		);
	});
});

describe('create and update field shapes', () => {
	it('requires everything Lago requires on create', () => {
		for (const name of ['code', 'name', 'interval', 'amountCents', 'amountCurrency']) {
			expect(fieldFor(name, 'create')?.required, name).toBe(true);
		}
	});

	// The unit is the easiest thing to get wrong by a factor of one hundred, so it is in the label
	// rather than only in the description.
	it('names the amount field in cents, and says so again in the description', () => {
		const amount = fieldFor('amountCents', 'create');
		expect(amount?.displayName).toBe('Amount (Cents)');
		expect(amount?.description).toMatch(/10000 means 100\.00/);
	});

	it('requires only the code on update, with everything else optional', () => {
		expect(fieldFor('code', 'update')?.required).toBe(true);
		expect(fieldFor('name', 'update')).toBeUndefined();
		expect(fieldFor('amountCents', 'update')).toBeUndefined();

		const names = (
			(fieldFor('additionalFields', 'update')?.options ?? []) as Array<{
				name: string;
			}>
		).map((option) => option.name);
		for (const name of ['name', 'interval', 'amount_cents', 'amount_currency', 'pay_in_advance']) {
			expect(names, name).toContain(name);
		}
	});
});

describe('toTaxCodes', () => {
	it('splits and trims a comma-separated list', () => {
		expect(toTaxCodes('french_standard_vat, us_sales_tax')).toEqual([
			'french_standard_vat',
			'us_sales_tax',
		]);
	});

	it('returns undefined for nothing usable, so the key is omitted rather than sent empty', () => {
		expect(toTaxCodes('')).toBeUndefined();
		expect(toTaxCodes(' , ')).toBeUndefined();
		expect(toTaxCodes(undefined)).toBeUndefined();
	});
});
