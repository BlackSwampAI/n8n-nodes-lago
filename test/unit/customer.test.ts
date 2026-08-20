import { describe, expect, it } from 'vitest';
import type { INodeProperties } from 'n8n-workflow';
import { Lago } from '../../nodes/Lago/Lago.node';
import { customerDescription, customerOperations } from '../../nodes/Lago/resources/customer';

const properties = new Lago().description.properties;

function findProperty(name: string): INodeProperties | undefined {
	return properties.find((property) => property.name === name);
}

/** Every resource value the node offers in its Resource dropdown. */
const resourceValues = (findProperty('resource')?.options ?? []).map(
	(option) => (option as { value: string }).value,
);

/** Every operation the node offers, across all resources. */
const operationOptions = properties
	.filter((property) => property.name === 'operation')
	.flatMap((property) => (property.options ?? []) as Array<{ value: string }>)
	.map((option) => option.value);

describe('Customer resource wiring', () => {
	it('offers Customer in the Resource dropdown', () => {
		expect(resourceValues).toContain('customer');
	});

	it('has a handler for every operation the UI offers', () => {
		for (const operation of operationOptions) {
			expect(Object.keys(customerOperations)).toContain(operation);
		}
	});

	it('offers every handler in the UI, so none is unreachable', () => {
		for (const operation of Object.keys(customerOperations)) {
			expect(operationOptions).toContain(operation);
		}
	});

	// Lago has no customer update endpoint — POST /customers upserts and PUT does not exist — so
	// separate Create and Update operations would imply semantics the API does not have.
	it('exposes one Create or Update operation rather than a Create and an Update', () => {
		expect(operationOptions).toContain('createOrUpdate');
		expect(operationOptions).not.toContain('create');
		expect(operationOptions).not.toContain('update');
	});
});

// A field bound to a resource or operation that does not exist silently never renders. Lint
// checks a field's shape, typecheck its types, and the wiring tests above only that handlers and
// menu entries agree — nothing else catches a typo like operation: ['getAl'].
describe('field bindings', () => {
	const bound = customerDescription.filter((property) => property.displayOptions?.show);

	it('binds every field to a resource that exists', () => {
		for (const property of bound) {
			for (const resource of property.displayOptions?.show?.resource ?? []) {
				expect(resourceValues, `${property.name} binds to resource ${resource}`).toContain(
					resource,
				);
			}
		}
	});

	it('binds every field to an operation that exists', () => {
		for (const property of bound) {
			for (const operation of property.displayOptions?.show?.operation ?? []) {
				expect(operationOptions, `${property.name} binds to operation ${operation}`).toContain(
					operation,
				);
			}
		}
	});

	it('binds every field to at least one operation, so none renders on all of them', () => {
		const operationSelector = customerDescription.find((property) => property.name === 'operation');
		for (const property of bound) {
			if (property === operationSelector) continue;
			expect(
				property.displayOptions?.show?.operation ?? [],
				`${property.name} is not bound to an operation`,
			).not.toHaveLength(0);
		}
	});
});

describe('field conventions n8n lints for', () => {
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
