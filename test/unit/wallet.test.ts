import { describe, expect, it } from 'vitest';
import { Lago } from '../../nodes/Lago/Lago.node';
import { walletOperations } from '../../nodes/Lago/resources/wallet';
import { walletTransactionOperations } from '../../nodes/Lago/resources/walletTransaction';

const properties = new Lago().description.properties;

function fieldFor(resource: string, name: string, operation: string) {
	return properties.find(
		(property) =>
			property.name === name &&
			property.displayOptions?.show?.resource?.includes(resource) &&
			property.displayOptions?.show?.operation?.includes(operation),
	);
}

function operationsOf(resource: string) {
	return properties
		.filter(
			(property) =>
				property.name === 'operation' &&
				property.displayOptions?.show?.resource?.includes(resource),
		)
		.flatMap(
			(property) => (property.options ?? []) as Array<{ value: string; description?: string }>,
		);
}

describe('wallet operations', () => {
	it('offers the wallet lifecycle', () => {
		expect(Object.keys(walletOperations).sort()).toEqual([
			'create',
			'get',
			'getAll',
			'terminate',
			'update',
		]);
	});

	// DELETE ends the wallet and keeps it, as subscription termination does, so calling it Delete
	// would promise a removal Lago does not perform.
	it('offers Terminate rather than Delete', () => {
		const values = operationsOf('wallet').map((option) => option.value);
		expect(values).toContain('terminate');
		expect(values).not.toContain('delete');
		expect(
			operationsOf('wallet').find((option) => option.value === 'terminate')?.description,
		).toMatch(/record is kept/i);
	});
});

// The single most confusing thing about wallets: one number lands in the balance and the other
// does not, and nothing in the field names says so.
describe('paid versus granted credits', () => {
	it.each([
		['wallet', 'create'],
		['walletTransaction', 'create'],
	])('warns on %s that paid credits stay pending', (resource, operation) => {
		expect(fieldFor(resource, 'paidCredits', operation)?.description).toMatch(/pending/i);
	});

	it.each([
		['wallet', 'create'],
		['walletTransaction', 'create'],
	])('says on %s that granted credits settle immediately', (resource, operation) => {
		expect(fieldFor(resource, 'grantedCredits', operation)?.description).toMatch(
			/settle immediately/i,
		);
	});

	// Sent as text so decimals survive exactly, as with every other Lago money field.
	it.each(['rateAmount', 'paidCredits', 'grantedCredits'])('types %s as a string', (field) => {
		expect(fieldFor('wallet', field, 'create')?.type).toBe('string');
	});
});

describe('wallet transactions', () => {
	it('offers creating and listing only', () => {
		expect(Object.keys(walletTransactionOperations).sort()).toEqual(['create', 'getAll']);
	});

	// One request produces a transaction per credit kind, so the operation is not named for one.
	it('warns that a single request can return more than one transaction', () => {
		const create = operationsOf('walletTransaction').find((option) => option.value === 'create');
		expect(create?.description).toMatch(/more than one item/i);
	});

	it('addresses the wallet by Lago ID and says where it comes from', () => {
		const field = fieldFor('walletTransaction', 'walletId', 'create');
		expect(field?.required).toBe(true);
		expect(field?.description).toMatch(/lago_id/i);
	});

	it('explains that pending transactions are not in the balance', () => {
		const filters = fieldFor('walletTransaction', 'filters', 'getAll');
		const status = ((filters?.options ?? []) as Array<{ name: string; description?: string }>).find(
			(option) => option.name === 'status',
		);
		expect(status?.description).toMatch(/not in the balance/i);
	});
});

// Lago answers 500 with NoMethodError rather than refusing cleanly, so exposing the field would
// make the node look broken. Deliberately absent.
describe('recurring top-up rules', () => {
	it('are not offered anywhere in the node', () => {
		const offending = properties.filter((property) =>
			String(property.name).toLowerCase().includes('recurring'),
		);
		const walletRelated = offending.filter((property) =>
			['wallet', 'walletTransaction'].some((resource) =>
				property.displayOptions?.show?.resource?.includes(resource),
			),
		);
		expect(walletRelated).toEqual([]);
	});
});
