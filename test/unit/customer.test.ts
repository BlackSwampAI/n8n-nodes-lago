import { describe, expect, it } from 'vitest';
import { Lago } from '../../nodes/Lago/Lago.node';
import { customerDescription } from '../../nodes/Lago/resources/customer';

const properties = new Lago().description.properties;

/** Every operation the node offers, across all resources. */
const operationOptions = properties
	.filter(
		(property) =>
			property.name === 'operation' &&
			property.displayOptions?.show?.resource?.includes('customer'),
	)
	.flatMap((property) => (property.options ?? []) as Array<{ value: string }>)
	.map((option) => option.value);

describe('Customer resource', () => {
	// Lago has no customer update endpoint — POST /customers upserts and PUT does not exist — so
	// separate Create and Update operations would imply semantics the API does not have.
	it('exposes one Create or Update operation rather than a Create and an Update', () => {
		expect(operationOptions).toContain('createOrUpdate');
		expect(operationOptions).not.toContain('create');
		expect(operationOptions).not.toContain('update');
	});
});

describe('premium fields', () => {
	// Accepted with a 200 and then stored as null on the free edition, so the description is the
	// only warning a workflow author will ever get.
	it('warns that a customer timezone is premium and silently ignored', () => {
		const timezone = (
			(customerDescription.find(
				(property) =>
					property.name === 'additionalFields' &&
					property.displayOptions?.show?.operation?.includes('createOrUpdate'),
			)?.options ?? []) as Array<{ name: string; description?: string }>
		).find((option) => option.name === 'timezone');

		expect(timezone?.description).toMatch(/premium licence/i);
		expect(timezone?.description).toMatch(/silently ignores/i);
	});
});

describe('Customer fields', () => {
	it('gives every option-typed field a default that is one of its options', () => {
		for (const property of customerDescription) {
			if (property.type !== 'options' || !property.options) continue;
			const values = (property.options as Array<{ value: unknown }>).map((o) => o.value);
			expect(values, `${property.name} default`).toContain(property.default);
		}
	});

	it('requires an external ID on every operation that addresses a single customer', () => {
		for (const operation of ['createOrUpdate', 'get', 'delete']) {
			const field = customerDescription.find(
				(property) =>
					property.name === 'externalId' &&
					property.displayOptions?.show?.operation?.includes(operation),
			);
			expect(field, `externalId for ${operation}`).toBeDefined();
			expect(field?.required).toBe(true);
		}
	});

	it('offers Return All and Limit on the list operation, with Limit hidden behind it', () => {
		const returnAll = customerDescription.find((property) => property.name === 'returnAll');
		const limit = customerDescription.find((property) => property.name === 'limit');
		expect(returnAll?.displayOptions?.show?.operation).toEqual(['getAll']);
		expect(limit?.displayOptions?.show?.returnAll).toEqual([false]);
	});
});
