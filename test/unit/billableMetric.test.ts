import { describe, expect, it } from 'vitest';
import { Lago } from '../../nodes/Lago/Lago.node';
import {
	AGGREGATIONS_NEEDING_FIELD,
	AGGREGATION_TYPES,
	buildFilters,
} from '../../nodes/Lago/resources/billableMetric/fields';

const properties = new Lago().description.properties;

function fieldFor(name: string, operation: string) {
	return properties.find(
		(property) =>
			property.name === name &&
			property.displayOptions?.show?.resource?.includes('billableMetric') &&
			property.displayOptions?.show?.operation?.includes(operation),
	);
}

describe('aggregation types', () => {
	it('offers every aggregation Lago accepts', () => {
		expect(AGGREGATION_TYPES.map((type) => type.value)).toEqual([
			'count_agg',
			'sum_agg',
			'max_agg',
			'unique_count_agg',
			'weighted_sum_agg',
			'latest_agg',
		]);
	});

	// Lago rejects every aggregation except count_agg without a field name, so Field Name is shown
	// exactly when it is needed rather than left optional and silently failing.
	it('requires a field name for every aggregation except Count', () => {
		expect(AGGREGATIONS_NEEDING_FIELD).not.toContain('count_agg');
		expect(AGGREGATIONS_NEEDING_FIELD).toHaveLength(AGGREGATION_TYPES.length - 1);
	});

	it('shows Field Name on exactly those aggregations, and marks it required', () => {
		const fieldName = fieldFor('fieldName', 'create');
		expect(fieldName?.required).toBe(true);
		expect(fieldName?.displayOptions?.show?.aggregationType).toEqual(AGGREGATIONS_NEEDING_FIELD);
	});

	it('gives every aggregation option a description, since the names alone are ambiguous', () => {
		for (const type of AGGREGATION_TYPES) {
			expect(type.description, type.value).toBeTruthy();
		}
	});
});

describe('create and update field shapes', () => {
	it('requires code, name and aggregation type on create', () => {
		for (const name of ['code', 'name', 'aggregationType']) {
			expect(fieldFor(name, 'create')?.required, name).toBe(true);
		}
	});

	// Update addresses an existing metric by code and leaves everything else optional, so name and
	// aggregation type move into Additional Fields rather than being required again.
	it('requires only the code on update', () => {
		expect(fieldFor('code', 'update')?.required).toBe(true);
		expect(fieldFor('name', 'update')).toBeUndefined();
		expect(fieldFor('aggregationType', 'update')).toBeUndefined();

		const additional = fieldFor('additionalFields', 'update');
		const names = ((additional?.options ?? []) as Array<{ name: string }>).map(
			(option) => option.name,
		);
		expect(names).toContain('name');
		expect(names).toContain('aggregation_type');
		expect(names).toContain('field_name');
	});
});

describe('buildFilters', () => {
	it('splits comma-separated values into the array Lago expects', () => {
		expect(buildFilters([{ key: 'model', values: 'gpt-4, gpt-3.5' }])).toEqual([
			{ key: 'model', values: ['gpt-4', 'gpt-3.5'] },
		]);
	});

	it('drops entries with no key or no values, which Lago would reject', () => {
		expect(
			buildFilters([
				{ key: '', values: 'a' },
				{ key: 'region', values: '' },
				{ key: 'region', values: ' , ' },
			]),
		).toEqual([]);
	});

	it('returns an empty array for no entries', () => {
		expect(buildFilters([])).toEqual([]);
	});
});
