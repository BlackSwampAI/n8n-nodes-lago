import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { routeOperations } from '../../nodes/Lago/shared/router';
import { createExecuteContext } from '../support/context';
import { hasLago, lagoApiKey, lagoBaseUrl } from '../support/env.mjs';

const describeLago = hasLago ? describe : describe.skip;

const runId = `t${Date.now().toString(36)}`;
const customerId = `${runId}-customer`;
let walletId = '';

async function run(resource: string, parameters: Record<string, unknown>) {
	const context = createExecuteContext({
		parameters: { resource, ...parameters },
		baseUrl: String(lagoBaseUrl),
		apiKey: String(lagoApiKey),
	});
	const output: INodeExecutionData[][] = await routeOperations.call(
		context as unknown as IExecuteFunctions,
	);
	return output[0];
}

async function createWallet(parameters: Record<string, unknown> = {}) {
	return run('wallet', {
		operation: 'create',
		externalCustomerId: customerId,
		name: 'Credits',
		currency: 'USD',
		rateAmount: '1',
		paidCredits: '0',
		grantedCredits: '0',
		additionalFields: {},
		...parameters,
	});
}

describeLago('Wallet resources against a live Lago instance', () => {
	beforeAll(async () => {
		await run('customer', {
			operation: 'createOrUpdate',
			externalId: customerId,
			additionalFields: { name: customerId, currency: 'USD' },
		});
		const [wallet] = await createWallet({ grantedCredits: '10' });
		walletId = String(wallet.json.lago_id);
	}, 60_000);

	afterAll(async () => {
		await run('customer', { operation: 'delete', externalId: customerId }).catch(() => undefined);
	}, 60_000);

	describe('wallets', () => {
		it('opens a wallet with a credit rate', async () => {
			const [item] = await run('wallet', { operation: 'get', walletId });
			expect(item.json.status).toBe('active');
			expect(item.json.rate_amount).toBe('1.0');
			expect(item.json.wallet).toBeUndefined();
		});

		// Granted credits settle immediately, so they are in the balance without any payment.
		it('credits granted credits to the balance immediately', async () => {
			await vi.waitFor(
				async () => {
					const [item] = await run('wallet', { operation: 'get', walletId });
					expect(Number(item.json.credits_balance)).toBe(10);
				},
				{ timeout: 20_000, interval: 1_000 },
			);
		}, 30_000);

		it('limits a wallet to particular fee types and metrics', async () => {
			const [item] = await createWallet({
				name: 'Limited',
				additionalFields: { fee_types: ['charge'] },
			});
			expect((item.json.applies_to as { fee_types: string[] }).fee_types).toEqual(['charge']);
		});

		it('sets an expiration date', async () => {
			const [item] = await createWallet({
				name: 'Expiring',
				additionalFields: { expiration_at: '2027-01-01T00:00:00Z' },
			});
			expect(String(item.json.expiration_at)).toMatch(/^2027-01-01/);
		});

		it('lists a customer’s wallets', async () => {
			const items = await run('wallet', {
				operation: 'getAll',
				returnAll: true,
				filterCustomerId: customerId,
			});
			expect(items.length).toBeGreaterThanOrEqual(3);
			for (const item of items) expect(item.json.external_customer_id).toBe(customerId);
		});

		it('renames a wallet', async () => {
			const [item] = await run('wallet', {
				operation: 'update',
				walletId,
				updateFields: { name: 'Renamed Credits' },
			});
			expect(item.json.name).toBe('Renamed Credits');
		});

		// DELETE ends the wallet and keeps it, as subscription termination does.
		it('terminates rather than deletes', async () => {
			const [created] = await createWallet({ name: 'Doomed' });
			const [item] = await run('wallet', {
				operation: 'terminate',
				walletId: String(created.json.lago_id),
			});
			expect(item.json.status).toBe('terminated');
		});
	});

	describe('wallet transactions', () => {
		// One request produces two transactions with different statuses, which is why the handler
		// returns a collection rather than a single record.
		it('records paid and granted credits as separate transactions', async () => {
			const items = await run('walletTransaction', {
				operation: 'create',
				walletId,
				paidCredits: '25',
				grantedCredits: '5',
				voidedCredits: '0',
				additionalFields: {},
			});

			expect(items).toHaveLength(2);
			const statuses = items.map((item) => String(item.json.status)).sort();
			expect(statuses).toEqual(['pending', 'settled']);
			for (const item of items) expect(item.json.transaction_type).toBe('inbound');
		});

		// The distinction the field descriptions rest on: paid credits wait for payment.
		it('leaves paid credits out of the balance until they settle', async () => {
			const [wallet] = await run('wallet', { operation: 'get', walletId });
			// 10 granted at creation plus 5 granted above; the 25 paid are still pending.
			expect(Number(wallet.json.credits_balance)).toBe(15);
		});

		it('records voided credits as an outbound transaction', async () => {
			const items = await run('walletTransaction', {
				operation: 'create',
				walletId,
				paidCredits: '0',
				grantedCredits: '0',
				voidedCredits: '5',
				additionalFields: {},
			});
			expect(items).toHaveLength(1);
			expect(items[0].json.transaction_type).toBe('outbound');
		});

		it('lists the transactions on a wallet', async () => {
			const items = await run('walletTransaction', {
				operation: 'getAll',
				walletId,
				returnAll: true,
				filters: {},
			});
			expect(items.length).toBeGreaterThanOrEqual(3);
		});

		it('filters transactions by status', async () => {
			const items = await run('walletTransaction', {
				operation: 'getAll',
				walletId,
				returnAll: true,
				filters: { status: 'pending' },
			});
			expect(items.length).toBeGreaterThan(0);
			for (const item of items) expect(item.json.status).toBe('pending');
		});
	});

	// Lago crashes rather than refusing, so the field is deliberately not exposed by the node.
	describe('recurring top-up rules', () => {
		it('answers 500 on the free edition, which is why the node omits the field', async () => {
			const response = await fetch(`${lagoBaseUrl}/api/v1/wallets`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${lagoApiKey}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					wallet: {
						external_customer_id: customerId,
						name: 'Auto',
						rate_amount: '1',
						currency: 'USD',
						paid_credits: '0',
						granted_credits: '0',
						recurring_transaction_rules: [
							{ trigger: 'interval', method: 'fixed', interval: 'monthly', paid_credits: '10' },
						],
					},
				}),
			});
			expect(response.status).toBe(500);
		});
	});
});
