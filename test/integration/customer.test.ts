import { afterAll, describe, expect, it } from 'vitest';
import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { routeOperations } from '../../nodes/Lago/shared/router';
import { createExecuteContext } from '../support/context';
import { hasLago, lagoApiKey, lagoBaseUrl } from '../support/env.mjs';

const describeLago = hasLago ? describe : describe.skip;

const runId = `t${Date.now().toString(36)}`;
const created = new Set<string>();

/** Runs the shipped router exactly as n8n would, and returns the JSON of each output item. */
async function run(
	parameters: Record<string, unknown>,
	options: { items?: Array<Record<string, unknown>>; continueOnFail?: boolean } = {},
) {
	const context = createExecuteContext({
		parameters,
		items: options.items,
		continueOnFail: options.continueOnFail,
		baseUrl: String(lagoBaseUrl),
		apiKey: String(lagoApiKey),
	});
	const output: INodeExecutionData[][] = await routeOperations.call(
		context as unknown as IExecuteFunctions,
	);
	return output[0];
}

async function createCustomer(externalId: string, additionalFields: Record<string, unknown> = {}) {
	created.add(externalId);
	return run({
		resource: 'customer',
		operation: 'createOrUpdate',
		externalId,
		additionalFields,
	});
}

describeLago('Customer resource against a live Lago instance', () => {
	afterAll(async () => {
		for (const externalId of created) {
			await run({ resource: 'customer', operation: 'delete', externalId }).catch(() => undefined);
		}
	}, 60_000);

	describe('lifecycle', () => {
		it('creates a customer and returns the record, not the envelope', async () => {
			const externalId = `${runId}-lifecycle`;
			const [item] = await createCustomer(externalId, { name: 'Acme', currency: 'USD' });

			expect(item.json.external_id).toBe(externalId);
			expect(item.json.name).toBe('Acme');
			// The handler unwraps Lago's { customer: {...} } envelope so downstream nodes see fields
			// directly rather than one nested object.
			expect(item.json.customer).toBeUndefined();
			expect(item.pairedItem).toEqual({ item: 0 });
		});

		it('reads the customer back by external ID', async () => {
			const externalId = `${runId}-lifecycle`;
			const [item] = await run({ resource: 'customer', operation: 'get', externalId });
			expect(item.json.external_id).toBe(externalId);
			expect(item.json.name).toBe('Acme');
		});

		// The operation that would be "Update" on most APIs. Lago has no update endpoint, so this
		// proves the single Create or Update operation genuinely updates.
		it('updates in place when the external ID already exists', async () => {
			const externalId = `${runId}-lifecycle`;
			const [item] = await createCustomer(externalId, { name: 'Acme Renamed' });
			expect(item.json.name).toBe('Acme Renamed');

			const [reread] = await run({ resource: 'customer', operation: 'get', externalId });
			expect(reread.json.name).toBe('Acme Renamed');
		});

		it('sends metadata as the array Lago expects', async () => {
			const externalId = `${runId}-metadata`;
			const [item] = await run({
				resource: 'customer',
				operation: 'createOrUpdate',
				externalId,
				additionalFields: {},
				metadata: { metadata: [{ key: 'tier', value: 'gold', display_in_invoice: true }] },
			});
			created.add(externalId);

			expect(item.json.metadata).toEqual([
				expect.objectContaining({ key: 'tier', value: 'gold', display_in_invoice: true }),
			]);
		});

		it('deletes the customer and reports it gone afterwards', async () => {
			const externalId = `${runId}-doomed`;
			await createCustomer(externalId);

			const [deleted] = await run({ resource: 'customer', operation: 'delete', externalId });
			expect(deleted.json.external_id).toBe(externalId);
			created.delete(externalId);

			await expect(run({ resource: 'customer', operation: 'get', externalId })).rejects.toThrow(
				/was not found/,
			);
		});
	});

	describe('listing', () => {
		it('returns every customer when Return All is set', async () => {
			const externalId = `${runId}-list-1`;
			await createCustomer(externalId);

			const items = await run({
				resource: 'customer',
				operation: 'getAll',
				returnAll: true,
				filters: {},
			});
			expect(items.some((item) => item.json.external_id === externalId)).toBe(true);
		});

		it('honours the limit', async () => {
			await createCustomer(`${runId}-list-2`);
			await createCustomer(`${runId}-list-3`);

			const items = await run({
				resource: 'customer',
				operation: 'getAll',
				returnAll: false,
				limit: 2,
				filters: {},
			});
			expect(items).toHaveLength(2);
		});

		it('filters by search term, which matches the external ID', async () => {
			const externalId = `${runId}-searchable`;
			await createCustomer(externalId, { name: 'Findable Industries' });

			const items = await run({
				resource: 'customer',
				operation: 'getAll',
				returnAll: true,
				filters: { search_term: externalId },
			});

			expect(items).toHaveLength(1);
			expect(items[0].json.external_id).toBe(externalId);
		});

		// Array filters go over the wire as `account_type[]=customer`, which is what Lago expects
		// and what axios produces from an array. Sending a joined string would silently match
		// nothing.
		it('filters by account type', async () => {
			const externalId = `${runId}-account-type`;
			await createCustomer(externalId);

			const items = await run({
				resource: 'customer',
				operation: 'getAll',
				returnAll: true,
				filters: { account_type: ['customer'], search_term: externalId },
			});
			expect(items).toHaveLength(1);
		});

		it('returns an empty list rather than failing when nothing matches', async () => {
			const items = await run({
				resource: 'customer',
				operation: 'getAll',
				returnAll: true,
				filters: { search_term: `${runId}-definitely-no-match` },
			});
			expect(items).toEqual([]);
		});
	});

	describe('failure handling', () => {
		it('reports a missing customer with a message naming it', async () => {
			await expect(
				run({ resource: 'customer', operation: 'get', externalId: `${runId}-ghost` }),
			).rejects.toThrow(new RegExp(`Customer ${runId}-ghost was not found`));
		});

		it('rejects an unknown operation rather than failing obscurely', async () => {
			await expect(run({ resource: 'customer', operation: 'teleport' })).rejects.toThrow(
				/not supported for the resource/,
			);
		});

		// One malformed row should not discard the rest of a sync run.
		it('reports per-item failures under Continue On Fail without losing good items', async () => {
			const externalId = `${runId}-continue`;
			await createCustomer(externalId);

			const items = await run(
				{ resource: 'customer', operation: 'get', externalId },
				{ items: [{}, {}], continueOnFail: true },
			);
			expect(items).toHaveLength(2);
			expect(items[0].json.external_id).toBe(externalId);

			const failures = await run(
				{ resource: 'customer', operation: 'get', externalId: `${runId}-ghost` },
				{ items: [{}], continueOnFail: true },
			);
			expect(failures).toHaveLength(1);
			expect(String(failures[0].json.error)).toMatch(/was not found/);
			expect(failures[0].pairedItem).toEqual({ item: 0 });
		});
	});
});
