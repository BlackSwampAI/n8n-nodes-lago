import { describe, expect, it } from 'vitest';
import { Lago } from '../../nodes/Lago/Lago.node';
import { CREDIT_NOTE_REASONS } from '../../nodes/Lago/resources/creditNote/fields';
import { creditNoteOperations } from '../../nodes/Lago/resources/creditNote';

const properties = new Lago().description.properties;

const operations = properties
	.filter(
		(property) =>
			property.name === 'operation' &&
			property.displayOptions?.show?.resource?.includes('creditNote'),
	)
	.flatMap(
		(property) => (property.options ?? []) as Array<{ value: string; description?: string }>,
	);

function operation(value: string) {
	return operations.find((option) => option.value === value);
}

describe('credit note operations', () => {
	it('offers the whole surface, gated ones included', () => {
		expect(Object.keys(creditNoteOperations).sort()).toEqual([
			'create',
			'download',
			'estimate',
			'get',
			'getAll',
			'void',
		]);
	});

	it('defaults to Get Many, which is what works without a licence', () => {
		const selector = properties.find(
			(property) =>
				property.name === 'operation' &&
				property.displayOptions?.show?.resource?.includes('creditNote'),
		);
		expect(selector?.default).toBe('getAll');
	});
});

// Verified against a live free-edition instance: Create and Estimate answer 403
// feature_unavailable, while the read operations work. Shipping them marked is more useful than
// omitting them, provided the marking is accurate.
describe('premium marking', () => {
	it.each(['create', 'estimate'])('marks %s as needing a premium licence', (value) => {
		expect(operation(value)?.description).toMatch(/premium licence/i);
	});

	it.each(['get', 'getAll', 'download', 'void'])('does not mark %s as premium', (value) => {
		expect(operation(value)?.description ?? '').not.toMatch(/premium/i);
	});
});

describe('credit note input', () => {
	it('offers every reason Lago accepts', () => {
		expect(CREDIT_NOTE_REASONS.map((reason) => reason.value).sort()).toEqual([
			'duplicated_charge',
			'fraudulent_charge',
			'order_cancellation',
			'order_change',
			'other',
			'product_unsatisfactory',
		]);
	});

	// A credit note credits specific fee lines rather than an invoice as a whole.
	it('explains where a fee ID comes from', () => {
		const items = properties.find(
			(property) =>
				property.name === 'items' && property.displayOptions?.show?.operation?.includes('create'),
		);
		expect(items?.description).toMatch(/fees array/i);
	});

	it('requires a reason on Create but not on Estimate', () => {
		const reasonOn = (op: string) =>
			properties.some(
				(property) =>
					property.name === 'reason' &&
					property.displayOptions?.show?.resource?.includes('creditNote') &&
					property.displayOptions?.show?.operation?.includes(op),
			);
		expect(reasonOn('create')).toBe(true);
		expect(reasonOn('estimate')).toBe(false);
	});

	it('addresses credit notes by Lago ID, as invoices are', () => {
		const field = properties.find(
			(property) =>
				property.name === 'creditNoteId' &&
				property.displayOptions?.show?.operation?.includes('get'),
		);
		expect(field?.required).toBe(true);
		expect(field?.description).toMatch(/lago_id/i);
	});
});
