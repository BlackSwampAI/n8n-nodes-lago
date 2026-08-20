import { describe, expect, it } from 'vitest';
import { Lago } from '../../nodes/Lago/Lago.node';
import {
	AGGREGATIONS_NEEDING_FIELD,
	AGGREGATIONS_SUPPORTING_RECURRING,
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

describe('recurring compatibility', () => {
	// Lago answers 422 recurring: not_compatible_with_aggregation_type for the other three.
	// Established against a live server, not from the specification, which does not say so.
	it('allows recurring only on the three aggregations Lago accepts it for', () => {
		expect([...AGGREGATIONS_SUPPORTING_RECURRING].sort()).toEqual([
			'sum_agg',
			'unique_count_agg',
			'weighted_sum_agg',
		]);
	});

	it('excludes every aggregation Lago rejects it for', () => {
		for (const rejected of ['count_agg', 'max_agg', 'latest_agg']) {
			expect(AGGREGATIONS_SUPPORTING_RECURRING, rejected).not.toContain(rejected);
		}
	});

	it('shows Recurring on create only for those aggregations', () => {
		expect(fieldFor('recurring', 'create')?.displayOptions?.show?.aggregationType).toEqual(
			AGGREGATIONS_SUPPORTING_RECURRING,
		);
	});

	it('does not leave a second Recurring in the create collection', () => {
		const names = (
			(fieldFor('additionalFields', 'create')?.options ?? []) as Array<{
				name: string;
			}>
		).map((option) => option.name);
		expect(names).not.toContain('recurring');
	});

	// Update addresses a metric by code without knowing its aggregation type, so the field cannot
	// be shown conditionally there. It stays in the collection with the rule spelled out.
	it('keeps Recurring in the update collection and names the compatible aggregations', () => {
		const recurring = (
			(fieldFor('additionalFields', 'update')?.options ?? []) as Array<{
				name: string;
				description?: string;
			}>
		).find((option) => option.name === 'recurring');

		expect(recurring).toBeDefined();
		expect(recurring?.description).toMatch(/Sum, Unique Count and Weighted Sum/);
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
