import { describe, expect, it } from 'vitest';
import { Lago } from '../../nodes/Lago/Lago.node';
import {
	buildRanges,
	CHARGE_MODELS,
	RANGE_MODELS,
} from '../../nodes/Lago/resources/planCharge/fields';

const node = new Lago();
const properties = node.description.properties;

function fieldFor(name: string, operation = 'create') {
	return properties.find(
		(property) =>
			property.name === name &&
			property.displayOptions?.show?.resource?.includes('planCharge') &&
			property.displayOptions?.show?.operation?.includes(operation),
	);
}

describe('charge models', () => {
	it('offers every model Lago supports', () => {
		expect(CHARGE_MODELS.map((model) => model.value).sort()).toEqual([
			'dynamic',
			'graduated',
			'graduated_percentage',
			'package',
			'percentage',
			'standard',
			'volume',
		]);
	});

	// Verified against a live server: it is the only model the free edition refuses.
	it('marks graduated percentage as needing a premium licence', () => {
		const model = CHARGE_MODELS.find((entry) => entry.value === 'graduated_percentage');
		expect(model?.description).toMatch(/premium licence/i);
	});

	it('gives every model a description, since the names alone do not explain the pricing', () => {
		for (const model of CHARGE_MODELS) expect(model.description, model.value).toBeTruthy();
	});
});

// The models share almost no properties, so a flat form would be mostly irrelevant at any
// moment. These assert each set appears only for its own model.
describe('per-model property fields', () => {
	it.each([
		['amount', 'standard'],
		['packageAmount', 'package'],
		['packageSize', 'package'],
		['rate', 'percentage'],
		['graduatedRanges', 'graduated'],
		['volumeRanges', 'volume'],
		['graduatedPercentageRanges', 'graduated_percentage'],
	])('shows %s only for the %s model', (field, model) => {
		expect(fieldFor(field)?.displayOptions?.show?.chargeModel).toEqual([model]);
	});

	it('shows no model-specific properties for dynamic, which has none', () => {
		const forDynamic = properties.filter((property) =>
			property.displayOptions?.show?.chargeModel?.includes('dynamic'),
		);
		expect(forDynamic).toEqual([]);
	});

	it('knows which models are priced in tiers', () => {
		expect(RANGE_MODELS).toEqual(['graduated', 'volume', 'graduated_percentage']);
	});
});

// Lago answers 422 properties: invalid_amount for a JSON number, and a decimal typed as text
// survives exactly as written, which a float cannot promise for money.
describe('money fields', () => {
	it.each(['amount', 'packageAmount', 'rate', 'fixedAmount'])('types %s as a string', (field) => {
		expect(fieldFor(field)?.type).toBe('string');
	});

	it('says why, so the type does not look like an oversight', () => {
		expect(fieldFor('amount')?.description).toMatch(/rejects a plain number/i);
	});

	// Silently stored as zero on the free edition, with a 200 and no error, so the description
	// is the only thing that can warn anyone.
	it('warns that the minimum amount is premium and silently ignored', () => {
		const minimum = (
			(fieldFor('additionalFields')?.options ?? []) as Array<{ name: string; description?: string }>
		).find((option) => option.name === 'min_amount_cents');
		expect(minimum?.description).toMatch(/premium licence/i);
		expect(minimum?.description).toMatch(/silently stores zero/i);
	});

	// Lago answers 422 invalid_billable_metric_or_charge_model unless the metric is recurring.
	it('warns that prorated needs a recurring metric', () => {
		const prorated = (
			(fieldFor('additionalFields')?.options ?? []) as Array<{ name: string; description?: string }>
		).find((option) => option.name === 'prorated');
		expect(prorated?.description).toMatch(/recurring/i);
	});

	// The one exception, and the reason it is called out in its own description.
	it('keeps the minimum amount in cents, matching the plan rather than the charge', () => {
		const minimum = (
			(fieldFor('additionalFields')?.options ?? []) as Array<{
				name: string;
				type: string;
				description?: string;
			}>
		).find((option) => option.name === 'min_amount_cents');
		expect(minimum?.type).toBe('number');
		expect(minimum?.description).toMatch(/in cents, unlike the amounts above/i);
	});
});

describe('metric reference', () => {
	// Charges reference the metric by Lago's UUID, which no workflow author has to hand.
	it('is a dropdown that sends the internal ID', () => {
		const field = fieldFor('billableMetricId');
		expect(field?.typeOptions?.loadOptionsMethod).toBe('getBillableMetricIds');
		expect(field?.required).toBe(true);
	});

	it('registers that loader on the node, separately from the code loader', () => {
		expect(Object.keys(node.methods.loadOptions).sort()).toEqual([
			'getBillableMetricCodes',
			'getBillableMetricIds',
		]);
	});

	// Update addresses an existing charge, whose metric cannot be changed.
	it('is not offered on update', () => {
		expect(fieldFor('billableMetricId', 'update')).toBeUndefined();
	});
});

describe('buildRanges', () => {
	it('treats a zero upper bound as an unbounded final tier', () => {
		expect(buildRanges([{ from_value: 101, to_value: 0, per_unit_amount: '0.02' }])).toEqual([
			{ from_value: 101, to_value: null, per_unit_amount: '0.02' },
		]);
	});

	it('keeps a real upper bound', () => {
		expect(buildRanges([{ from_value: 0, to_value: 100, per_unit_amount: '0.05' }])).toEqual([
			{ from_value: 0, to_value: 100, per_unit_amount: '0.05' },
		]);
	});

	it('omits blank amounts rather than sending empty strings', () => {
		expect(
			buildRanges([{ from_value: 0, to_value: 10, per_unit_amount: '', flat_amount: '  ' }]),
		).toEqual([{ from_value: 0, to_value: 10 }]);
	});

	it('carries the rate used by the percentage tiers', () => {
		expect(buildRanges([{ from_value: 0, to_value: 10, rate: '2' }])).toEqual([
			{ from_value: 0, to_value: 10, rate: '2' },
		]);
	});
});
