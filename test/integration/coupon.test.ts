import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { routeOperations } from '../../nodes/Lago/shared/router';
import { createExecuteContext } from '../support/context';
import { hasLago, lagoApiKey, lagoBaseUrl } from '../support/env.mjs';

const describeLago = hasLago ? describe : describe.skip;

const runId = `t${Date.now().toString(36)}`;
const customerId = `${runId}-customer`;
const planCode = `${runId}_plan`;
const coupons = new Set<string>();

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

async function createCoupon(code: string, parameters: Record<string, unknown> = {}) {
	coupons.add(code);
	return run('coupon', {
		operation: 'create',
		code,
		name: code,
		couponType: 'fixed_amount',
		amountCents: 1000,
		amountCurrency: 'USD',
		frequency: 'once',
		expiration: 'no_expiration',
		additionalFields: {},
		...parameters,
	});
}

describeLago('Coupon resource against a live Lago instance', () => {
	beforeAll(async () => {
		await run('customer', {
			operation: 'createOrUpdate',
			externalId: customerId,
			additionalFields: { name: customerId, currency: 'USD' },
		});
		await run('plan', {
			operation: 'create',
			code: planCode,
			name: planCode,
			interval: 'monthly',
			amountCents: 1000,
			amountCurrency: 'USD',
			payInAdvance: false,
			additionalFields: {},
		});
	}, 60_000);

	afterAll(async () => {
		for (const code of coupons) {
			await run('coupon', { operation: 'delete', code }).catch(() => undefined);
		}
		await run('plan', { operation: 'delete', code: planCode }).catch(() => undefined);
		await run('customer', { operation: 'delete', externalId: customerId }).catch(() => undefined);
	}, 60_000);

	// A coupon's shape depends on three independent choices, and each unlocks different fields.
	describe('coupon shapes', () => {
		it('creates a fixed-amount coupon', async () => {
			const [item] = await createCoupon(`${runId}_fixed`);
			expect(item.json.coupon_type).toBe('fixed_amount');
			expect(item.json.amount_cents).toBe(1000);
			expect(item.json.coupon).toBeUndefined();
		});

		it('creates a percentage coupon, sending the rate exactly as typed', async () => {
			const [item] = await createCoupon(`${runId}_pct`, {
				couponType: 'percentage',
				percentageRate: '12.5',
			});
			expect(item.json.coupon_type).toBe('percentage');
			expect(item.json.percentage_rate).toBe('12.5');
		});

		it('creates a recurring coupon with a duration', async () => {
			const [item] = await createCoupon(`${runId}_recurring`, {
				frequency: 'recurring',
				frequencyDuration: 3,
			});
			expect(item.json.frequency).toBe('recurring');
			expect(item.json.frequency_duration).toBe(3);
		});

		it('creates a coupon that expires', async () => {
			const [item] = await createCoupon(`${runId}_expiring`, {
				expiration: 'time_limit',
				expirationAt: '2027-01-01T00:00:00Z',
			});
			expect(item.json.expiration).toBe('time_limit');
			expect(String(item.json.expiration_at)).toMatch(/^2027-01-01/);
		});

		it('limits a coupon to specific plans', async () => {
			const [item] = await createCoupon(`${runId}_limited`, {
				additionalFields: { plan_codes: planCode, reusable: false },
			});
			expect(item.json.plan_codes).toEqual([planCode]);
			expect(item.json.reusable).toBe(false);
		});

		// Lago answers 422 expiration: value_is_invalid without it, which is why the field is a
		// required choice rather than an optional extra.
		it('confirms Lago requires an expiration setting', async () => {
			const response = await fetch(`${lagoBaseUrl}/api/v1/coupons`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${lagoApiKey}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					coupon: {
						name: 'no expiration setting',
						code: `${runId}_noexp`,
						coupon_type: 'fixed_amount',
						amount_cents: 100,
						amount_currency: 'USD',
						frequency: 'once',
					},
				}),
			});
			expect(response.status).toBe(422);
			expect(JSON.stringify(await response.json())).toMatch(/expiration/);
		});
	});

	describe('reading and changing', () => {
		it('gets a coupon by code', async () => {
			const [item] = await run('coupon', { operation: 'get', code: `${runId}_fixed` });
			expect(item.json.code).toBe(`${runId}_fixed`);
		});

		it('lists coupons', async () => {
			const items = await run('coupon', { operation: 'getAll', returnAll: true });
			expect(items.some((item) => item.json.code === `${runId}_fixed`)).toBe(true);
		});

		it('honours the limit', async () => {
			const items = await run('coupon', { operation: 'getAll', returnAll: false, limit: 2 });
			expect(items).toHaveLength(2);
		});

		it('updates a coupon', async () => {
			const [item] = await run('coupon', {
				operation: 'update',
				code: `${runId}_fixed`,
				couponType: 'fixed_amount',
				amountCents: 2500,
				amountCurrency: 'USD',
				frequency: 'once',
				expiration: 'no_expiration',
				additionalFields: {},
			});
			expect(item.json.amount_cents).toBe(2500);
		});

		it('deletes a coupon', async () => {
			const code = `${runId}_doomed`;
			await createCoupon(code);
			await run('coupon', { operation: 'delete', code });
			coupons.delete(code);

			await expect(run('coupon', { operation: 'get', code })).rejects.toThrow(/was not found/);
		});
	});

	// An applied coupon is a record in its own right, separate from the coupon it came from.
	describe('applying to customers', () => {
		let appliedId = '';

		it('applies a coupon to a customer', async () => {
			const [item] = await run('coupon', {
				operation: 'apply',
				externalCustomerId: customerId,
				couponCode: `${runId}_pct`,
				overrides: {},
			});
			appliedId = String(item.json.lago_id);

			expect(item.json.coupon_code).toBe(`${runId}_pct`);
			expect(item.json.status).toBe('active');
		});

		it('applies a coupon on terms that differ from its own', async () => {
			const [item] = await run('coupon', {
				operation: 'apply',
				externalCustomerId: customerId,
				couponCode: `${runId}_recurring`,
				overrides: { frequency_duration: 6 },
			});
			expect(item.json.frequency_duration).toBe(6);
		});

		it('lists applied coupons for the customer', async () => {
			const items = await run('coupon', {
				operation: 'getAllApplied',
				returnAll: true,
				filters: { external_customer_id: customerId },
			});
			expect(items.length).toBeGreaterThanOrEqual(2);
		});

		it('removes an applied coupon by its own ID, not the coupon code', async () => {
			const [item] = await run('coupon', {
				operation: 'removeApplied',
				externalCustomerId: customerId,
				appliedCouponId: appliedId,
			});
			expect(item.json.status).toBe('terminated');
		});
	});
});
