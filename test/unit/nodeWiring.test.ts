import { describe, expect, it } from 'vitest';
import type { INodeProperties } from 'n8n-workflow';
import { Lago } from '../../nodes/Lago/Lago.node';
import { resources } from '../../nodes/Lago/shared/router';

const properties = new Lago().description.properties;

const resourceSelector = properties.find((property) => property.name === 'resource');
const resourceValues = ((resourceSelector?.options ?? []) as Array<{ value: string }>).map(
	(option) => option.value,
);

/** Operation selectors, keyed by the resource they belong to. */
const operationSelectors = properties.filter(
	(property) => property.name === 'operation',
) as INodeProperties[];

function operationsFor(resource: string): string[] {
	const selector = operationSelectors.find((property) =>
		property.displayOptions?.show?.resource?.includes(resource),
	);
	return ((selector?.options ?? []) as Array<{ value: string }>).map((option) => option.value);
}

const allOperations = operationSelectors.flatMap(
	(selector) => (selector.options ?? []) as Array<{ value: string }>,
);

describe('resource and handler agreement', () => {
	it('offers every dispatchable resource in the Resource dropdown', () => {
		expect(resourceValues.sort()).toEqual(Object.keys(resources).sort());
	});

	it.each(Object.keys(resources))('has an operation selector for %s', (resource) => {
		expect(operationsFor(resource).length).toBeGreaterThan(0);
	});

	it.each(Object.keys(resources))('has a handler for every %s operation offered', (resource) => {
		for (const operation of operationsFor(resource)) {
			expect(Object.keys(resources[resource]), `${resource}.${operation}`).toContain(operation);
		}
	});

	it.each(Object.keys(resources))('offers every %s handler in the UI', (resource) => {
		for (const operation of Object.keys(resources[resource])) {
			expect(operationsFor(resource), `${resource}.${operation}`).toContain(operation);
		}
	});
});

// A field bound to a resource or operation that does not exist silently never renders. Lint
// checks a field's shape and typecheck its types; nothing else catches operation: ['getAl'].
describe('field bindings', () => {
	const bound = properties.filter(
		(property) => property.displayOptions?.show && property.name !== 'operation',
	);

	it('binds every field to a resource that exists', () => {
		for (const property of bound) {
			for (const resource of property.displayOptions?.show?.resource ?? []) {
				expect(resourceValues, `${property.name} -> resource ${resource}`).toContain(resource);
			}
		}
	});

	it('binds every field to an operation that exists on its own resource', () => {
		for (const property of bound) {
			const owners = property.displayOptions?.show?.resource ?? [];
			for (const operation of property.displayOptions?.show?.operation ?? []) {
				const valid = owners.flatMap((resource) => operationsFor(String(resource)));
				expect(valid, `${property.name} -> operation ${operation}`).toContain(operation);
			}
		}
	});

	it('binds every field to at least one resource and one operation', () => {
		for (const property of bound) {
			expect(
				property.displayOptions?.show?.resource ?? [],
				`${property.name} resource`,
			).not.toEqual([]);
			expect(
				property.displayOptions?.show?.operation ?? [],
				`${property.name} operation`,
			).not.toEqual([]);
		}
	});
});

describe('field conventions', () => {
	it('gives every option-typed field a default that is one of its options', () => {
		const check = (property: INodeProperties, path: string) => {
			if ((property.type === 'options' || property.type === 'multiOptions') && property.options) {
				const values = (property.options as Array<{ value: unknown }>)
					.filter((option) => 'value' in option)
					.map((option) => option.value);
				if (values.length === 0) return;
				if (property.type === 'multiOptions') {
					for (const entry of (property.default ?? []) as unknown[]) {
						expect(values, `${path} default`).toContain(entry);
					}
				} else {
					expect(values, `${path} default`).toContain(property.default);
				}
			}
			for (const option of (property.options ?? []) as INodeProperties[]) {
				if (option && typeof option === 'object' && 'name' in option && 'type' in option) {
					check(option, `${path}.${String(option.name)}`);
				}
			}
		};

		for (const property of properties) check(property, String(property.name));
	});

	it('gives every operation an action, which n8n shows in the actions panel', () => {
		for (const option of allOperations as Array<{ value: string; action?: string }>) {
			expect(option.action, `${option.value} action`).toBeTruthy();
		}
	});

	it('sets noDataExpression on the resource and operation selectors', () => {
		expect(resourceSelector?.noDataExpression).toBe(true);
		for (const selector of operationSelectors) {
			expect(selector.noDataExpression).toBe(true);
		}
	});
});
