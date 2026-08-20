import { describe, expect, it } from 'vitest';
import { Lago } from '../../nodes/Lago/Lago.node';
import { BILLING_TIMES } from '../../nodes/Lago/resources/subscription/create';
import { SUBSCRIPTION_STATUSES } from '../../nodes/Lago/resources/subscription/getAll';

const properties = new Lago().description.properties;

function fieldFor(name: string, operation: string) {
	return properties.find(
		(property) =>
			property.name === name &&
			property.displayOptions?.show?.resource?.includes('subscription') &&
			property.displayOptions?.show?.operation?.includes(operation),
	);
}

const operations = properties
	.filter(
		(property) =>
			property.name === 'operation' &&
			property.displayOptions?.show?.resource?.includes('subscription'),
	)
	.flatMap(
		(property) => (property.options ?? []) as Array<{ value: string; description?: string }>,
	);

describe('subscription operations', () => {
	// DELETE ends the subscription and keeps it as a terminated record, so naming the operation
	// Delete would promise removal the API does not perform.
	it('offers Terminate rather than Delete', () => {
		const values = operations.map((option) => option.value);
		expect(values).toContain('terminate');
		expect(values).not.toContain('delete');
	});

	it('says the record is kept rather than removed', () => {
		const terminate = operations.find((option) => option.value === 'terminate');
		expect(terminate?.description).toMatch(/kept|terminated status/i);
	});
});

describe('create fields', () => {
	it('requires the customer, the plan and an external ID', () => {
		for (const name of ['externalCustomerId', 'planCode', 'externalId']) {
			expect(fieldFor(name, 'create')?.required, name).toBe(true);
		}
	});

	it('offers both billing times, defaulting to calendar as Lago does', () => {
		expect(BILLING_TIMES.map((entry) => entry.value)).toEqual(['calendar', 'anniversary']);
		const billingTime = (
			(fieldFor('additionalFields', 'create')?.options ?? []) as Array<{
				name: string;
				default?: unknown;
			}>
		).find((option) => option.name === 'billing_time');
		expect(billingTime?.default).toBe('calendar');
	});

	it('explains that the external ID is an idempotency key', () => {
		expect(fieldFor('externalId', 'create')?.description).toMatch(/idempotency key/i);
	});
});

describe('get many filters', () => {
	it('offers every status Lago accepts', () => {
		expect(SUBSCRIPTION_STATUSES.map((entry) => entry.value)).toEqual([
			'active',
			'pending',
			'terminated',
			'canceled',
		]);
	});

	// Lago returns only active subscriptions when the filter is omitted, which reads like data
	// loss after a termination unless the field says so.
	it('warns that an empty status filter means active only', () => {
		const status = (
			(fieldFor('filters', 'getAll')?.options ?? []) as Array<{
				name: string;
				description?: string;
			}>
		).find((option) => option.name === 'status');
		expect(status?.description).toMatch(/only active/i);
	});
});

describe('terminate fields', () => {
	// The same external ID can name both a live subscription and a pending downgrade, so without
	// this option the pending one cannot be cancelled through the node at all.
	it('lets the caller choose between the active and the pending subscription', () => {
		const status = fieldFor('status', 'terminate');
		expect((status?.options as Array<{ value: string }>).map((option) => option.value)).toEqual([
			'active',
			'pending',
		]);
		expect(status?.default).toBe('active');
		expect(status?.description).toMatch(/upgrade or downgrade/i);
	});
});
