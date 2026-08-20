import { describe, expect, it } from 'vitest';
import { Lago } from '../../nodes/Lago/Lago.node';
import { INVOICE_STATUSES, PAYMENT_STATUSES } from '../../nodes/Lago/resources/invoice/getAll';
import { invoiceOperations } from '../../nodes/Lago/resources/invoice';

const properties = new Lago().description.properties;

const operations = properties
	.filter(
		(property) =>
			property.name === 'operation' && property.displayOptions?.show?.resource?.includes('invoice'),
	)
	.flatMap(
		(property) => (property.options ?? []) as Array<{ value: string; description?: string }>,
	);

function operation(value: string) {
	return operations.find((option) => option.value === value);
}

function fieldsFor(op: string) {
	return properties.filter(
		(property) =>
			property.displayOptions?.show?.resource?.includes('invoice') &&
			property.displayOptions?.show?.operation?.includes(op),
	);
}

describe('invoice operations', () => {
	// Invoices have no conventional CRUD. There is no delete, and the lifecycle actions are the
	// point of the resource.
	it('offers the lifecycle actions rather than plain CRUD', () => {
		expect(Object.keys(invoiceOperations).sort()).toEqual([
			'create',
			'download',
			'finalize',
			'get',
			'getAll',
			'retryPayment',
			'update',
			'void',
		]);
	});

	it('does not offer a delete, which Lago does not meaningfully support here', () => {
		expect(operations.map((option) => option.value)).not.toContain('delete');
	});

	it('defaults to Get Many, since most workflows read invoices rather than raise them', () => {
		const selector = properties.find(
			(property) =>
				property.name === 'operation' &&
				property.displayOptions?.show?.resource?.includes('invoice'),
		);
		expect(selector?.default).toBe('getAll');
	});
});

// Each of these warnings exists because the live API behaves in a way the operation name does
// not suggest. Asserting them keeps the wording from quietly disappearing.
describe('operation descriptions carry the surprises', () => {
	it('says a one-off invoice is issued already finalized', () => {
		expect(operation('create')?.description).toMatch(/already finalized/i);
	});

	it('says an already-finalized invoice is reported as not found', () => {
		expect(operation('finalize')?.description).toMatch(/not found/i);
	});

	it('says drafts need a premium grace period', () => {
		expect(operation('finalize')?.description).toMatch(/premium/i);
	});

	it('says the PDF renders asynchronously', () => {
		expect(operation('download')?.description).toMatch(/asynchronous/i);
	});

	it('says voiding keeps the record', () => {
		expect(operation('void')?.description).toMatch(/record is kept/i);
	});
});

describe('invoice identity', () => {
	// Every other resource is addressed by something the workflow author chose. Invoices are not.
	it.each(['get', 'finalize', 'void', 'download', 'retryPayment', 'update'])(
		'addresses %s by Lago ID and says where it comes from',
		(op) => {
			const field = fieldsFor(op).find((property) => property.name === 'invoiceId');
			expect(field?.required).toBe(true);
			expect(field?.description).toMatch(/lago_id/i);
		},
	);
});

describe('one-off fees', () => {
	// Invoices use integer cents while plan charges use decimal strings, so the field says which.
	it('prices fees in cents and warns that charges differ', () => {
		const fees = fieldsFor('create').find((property) => property.name === 'fees');
		const values = (
			fees?.options as Array<{ values: Array<{ name: string; description?: string }> }>
		)[0].values;
		const unitAmount = values.find((value) => value.name === 'unit_amount_cents');
		expect(unitAmount?.description).toMatch(/cents, unlike the decimal amounts/i);
	});

	it('explains that a fee line references an add-on defined in Lago', () => {
		const fees = fieldsFor('create').find((property) => property.name === 'fees');
		expect(fees?.description).toMatch(/add-on/i);
	});
});

describe('list filters', () => {
	it('offers every invoice status', () => {
		expect(INVOICE_STATUSES.map((status) => status.value)).toEqual([
			'draft',
			'finalized',
			'voided',
			'failed',
			'pending',
		]);
	});

	it('offers every payment status', () => {
		expect(PAYMENT_STATUSES.map((status) => status.value)).toEqual([
			'pending',
			'succeeded',
			'failed',
		]);
	});
});
