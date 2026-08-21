import { describe, expect, it } from 'vitest';
import { Lago } from '../../nodes/Lago/Lago.node';
import { buildProperties, eventValueFields } from '../../nodes/Lago/resources/event/fields';

const node = new Lago();
const properties = node.description.properties;

function fieldFor(name: string, operation: string) {
	return properties.find(
		(property) =>
			property.name === name &&
			property.displayOptions?.show?.resource?.includes('event') &&
			property.displayOptions?.show?.operation?.includes(operation),
	);
}

describe('buildProperties', () => {
	// Lago aggregates these arithmetically. A Sum metric handed the string "250" would not add
	// up the way the workflow author expects, and n8n's key/value input is string-typed.
	it('converts numeric-looking values to numbers', () => {
		expect(buildProperties([{ key: 'units', value: '250' }])).toEqual({ units: 250 });
		expect(buildProperties([{ key: 'ratio', value: '1.5' }])).toEqual({ ratio: 1.5 });
		expect(buildProperties([{ key: 'negative', value: '-3' }])).toEqual({ negative: -3 });
	});

	// Metrics also filter on string properties, so text must survive untouched.
	it('leaves non-numeric values as strings', () => {
		expect(buildProperties([{ key: 'model', value: 'gpt-4' }])).toEqual({ model: 'gpt-4' });
		expect(buildProperties([{ key: 'region', value: '' }])).toEqual({ region: '' });
	});

	it('skips rows with no key', () => {
		expect(
			buildProperties([
				{ key: '  ', value: '1' },
				{ key: 'a', value: '2' },
			]),
		).toEqual({
			a: 2,
		});
	});

	it('returns an empty object for no rows', () => {
		expect(buildProperties([])).toEqual({});
	});
});

describe('the metric code field', () => {
	// Lago accepts an event whose code matches no active metric and then silently drops it, so
	// the field is a dropdown of real codes rather than free text.
	it('is a dropdown backed by the billable metrics in Lago', () => {
		const code = fieldFor('code', 'send');
		expect(code?.type).toBe('options');
		expect(code?.typeOptions?.loadOptionsMethod).toBe('getBillableMetricCodes');
	});

	it('registers that load-options method on the node', () => {
		expect(Object.keys(node.methods.loadOptions)).toContain('getBillableMetricCodes');
	});

	it('warns that an unmatched code is silently ignored', () => {
		expect(fieldFor('code', 'send')?.description).toMatch(/silently ignored/i);
	});
});

// The most dangerous behaviour in the node: Lago answers 200, stores the event, and never bills
// it. Nothing errors, so nobody thinks to hover — the warning has to be visible in the panel.
describe('the unmatched-code notice', () => {
	const notice = properties.find((property) => property.name === 'unmatchedCodeNotice');

	it('is a panel notice rather than a tooltip', () => {
		expect(notice?.type).toBe('notice');
		expect(notice?.displayName).toMatch(/accepted and never billed/i);
	});

	it('appears on both operations that send events', () => {
		expect(notice?.displayOptions?.show?.operation).toEqual(['send', 'sendBatch']);
	});
});

describe('event field reuse', () => {
	it('describes an event the same way wherever one is described', () => {
		const names = eventValueFields().map((field) => field.name);
		expect(names).toEqual([
			'externalSubscriptionId',
			'code',
			'transactionId',
			'timestamp',
			'properties',
		]);
	});

	// An estimate describes usage that has not happened, so neither an idempotency key nor a
	// time of occurrence means anything for it.
	it('drops the transaction ID and timestamp from Estimate Fees', () => {
		expect(fieldFor('transactionId', 'estimateFees')).toBeUndefined();
		expect(fieldFor('timestamp', 'estimateFees')).toBeUndefined();
		expect(fieldFor('code', 'estimateFees')).toBeDefined();
	});

	it('offers Send Batch as a list of the same event shape', () => {
		const events = fieldFor('events', 'sendBatch');
		const inner = (events?.options as Array<{ values: Array<{ name: string }> }>)[0].values;
		expect(inner.map((field) => field.name)).toEqual(eventValueFields().map((f) => f.name));
	});
});

describe('operation descriptions', () => {
	const operations = properties
		.filter(
			(property) =>
				property.name === 'operation' && property.displayOptions?.show?.resource?.includes('event'),
		)
		.flatMap(
			(property) => (property.options ?? []) as Array<{ value: string; description?: string }>,
		);

	// A 200 from Lago means accepted, not aggregated, and a workflow that reads usage straight
	// afterwards will not see it yet.
	it('says that ingestion is asynchronous', () => {
		const send = operations.find((option) => option.value === 'send');
		expect(send?.description).toMatch(/asynchronously/i);
	});

	it('says Estimate Fees needs a pay-in-advance charge', () => {
		const estimate = operations.find((option) => option.value === 'estimateFees');
		expect(estimate?.description).toMatch(/pay-in-advance/i);
	});
});
