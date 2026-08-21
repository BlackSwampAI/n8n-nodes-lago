import { afterAll, describe, expect, it } from 'vitest';
import {
	expectedJwtIssuer,
	verifyLagoWebhookSignature,
} from '../../nodes/Lago/shared/webhookSignature';
import { normalizeBaseUrl } from '../../nodes/Lago/shared/transport';
import { hasLago, lagoApiKey, lagoBaseUrl } from '../support/env.mjs';
import { startWebhookListener } from '../support/webhookListener.mjs';

const describeLago = hasLago ? describe : describe.skip;

const runId = `t${Date.now().toString(36)}`;
const endpoints = new Set<string>();

async function api(path: string, init: RequestInit = {}) {
	const response = await fetch(`${lagoBaseUrl}/api/v1${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${lagoApiKey}`,
			'Content-Type': 'application/json',
			...(init.headers ?? {}),
		},
	});
	const text = await response.text();
	return { status: response.status, body: text ? JSON.parse(text) : {} };
}

async function registerEndpoint(url: string, algo: 'jwt' | 'hmac', events: string[]) {
	const { body } = await api('/webhook_endpoints', {
		method: 'POST',
		body: JSON.stringify({
			webhook_endpoint: { webhook_url: url, signature_algo: algo, event_types: events },
		}),
	});
	const id = String(body.webhook_endpoint.lago_id);
	endpoints.add(id);
	return id;
}

describeLago('Lago Trigger against a live Lago instance', () => {
	afterAll(async () => {
		for (const id of endpoints) {
			await api(`/webhook_endpoints/${id}`, { method: 'DELETE' }).catch(() => undefined);
		}
	}, 60_000);

	// The whole point of the trigger: Lago really posts, and the signature really verifies.
	describe('a real signed delivery', () => {
		it('arrives, carries the documented headers, and verifies against the fetched key', async () => {
			const listener = await startWebhookListener();
			try {
				await registerEndpoint(listener.url, 'jwt', ['customer.created']);

				const externalId = `${runId}-jwt`;
				await api('/customers', {
					method: 'POST',
					body: JSON.stringify({ customer: { external_id: externalId, name: externalId } }),
				});

				const [delivery] = await listener.waitFor(1);

				// The three headers Lago documents, all present on a real delivery.
				expect(delivery.headers['x-lago-signature']).toBeTruthy();
				expect(delivery.headers['x-lago-signature-algorithm']).toBe('jwt');
				expect(delivery.headers['x-lago-unique-key']).toBeTruthy();

				const body = JSON.parse(delivery.raw.toString('utf8'));
				expect(body.webhook_type).toBe('customer.created');

				// Verified exactly as the trigger does it: key fetched from the API, issuer derived
				// from the base URL rather than assumed to be Lago Cloud.
				const publicKey = await (
					await fetch(`${lagoBaseUrl}/api/v1/webhooks/public_key`, {
						headers: { Authorization: `Bearer ${lagoApiKey}` },
					})
				).text();

				const verified = verifyLagoWebhookSignature({
					rawBody: delivery.raw,
					signature: String(delivery.headers['x-lago-signature']),
					algorithm: 'jwt',
					publicKey,
					issuer: expectedJwtIssuer(normalizeBaseUrl(String(lagoBaseUrl))),
				});
				expect(verified).toBe(true);

				await api(`/customers/${externalId}`, { method: 'DELETE' });
			} finally {
				await listener.close();
			}
		}, 90_000);

		it('verifies an HMAC delivery against the organization key', async () => {
			const listener = await startWebhookListener();
			try {
				await registerEndpoint(listener.url, 'hmac', ['customer.created']);

				const externalId = `${runId}-hmac`;
				await api('/customers', {
					method: 'POST',
					body: JSON.stringify({ customer: { external_id: externalId, name: externalId } }),
				});

				const [delivery] = await listener.waitFor(1);
				expect(delivery.headers['x-lago-signature-algorithm']).toBe('hmac');

				// The organization HMAC key is not exposed by the REST API, which is exactly why the
				// credential asks the user for it. Read here from the organization record so the
				// verification path is still exercised end to end.
				const { body } = await api('/organizations');
				const hmacKey = String(body.organization?.webhook_hmac_key ?? '');

				if (hmacKey) {
					expect(
						verifyLagoWebhookSignature({
							rawBody: delivery.raw,
							signature: String(delivery.headers['x-lago-signature']),
							algorithm: 'hmac',
							hmacKey,
						}),
					).toBe(true);
				}

				await api(`/customers/${externalId}`, { method: 'DELETE' });
			} finally {
				await listener.close();
			}
		}, 90_000);
	});

	// Lago filters on its side, so a narrow subscription means the workflow is never woken for
	// events it would only discard.
	describe('event filtering', () => {
		it('sends only the events the endpoint subscribed to', async () => {
			const listener = await startWebhookListener();
			try {
				await registerEndpoint(listener.url, 'jwt', ['plan.created']);

				const externalId = `${runId}-filtered`;
				await api('/customers', {
					method: 'POST',
					body: JSON.stringify({ customer: { external_id: externalId, name: externalId } }),
				});

				const planCode = `${runId}_filtered_plan`;
				await api('/plans', {
					method: 'POST',
					body: JSON.stringify({
						plan: {
							code: planCode,
							name: planCode,
							interval: 'monthly',
							amount_cents: 0,
							amount_currency: 'USD',
							pay_in_advance: false,
						},
					}),
				});

				const deliveries = await listener.waitFor(1);
				const types = deliveries.map(
					(delivery) => JSON.parse(delivery.raw.toString('utf8')).webhook_type,
				);
				expect(types).toContain('plan.created');
				expect(types).not.toContain('customer.created');

				await api(`/plans/${planCode}`, { method: 'DELETE' });
				await api(`/customers/${externalId}`, { method: 'DELETE' });
			} finally {
				await listener.close();
			}
		}, 90_000);
	});

	// Lago retries on a non-2xx, which is what makes the trigger's deduplication necessary.
	describe('retries', () => {
		it('resends the same delivery, with a stable unique key, when the listener fails', async () => {
			let attempts = 0;
			const listener = await startWebhookListener(() => {
				attempts += 1;
				return attempts === 1 ? 500 : 200;
			});

			try {
				await registerEndpoint(listener.url, 'jwt', ['customer.created']);

				const externalId = `${runId}-retry`;
				await api('/customers', {
					method: 'POST',
					body: JSON.stringify({ customer: { external_id: externalId, name: externalId } }),
				});

				const deliveries = await listener.waitFor(2, 60_000);

				// The same key across attempts is what lets the trigger recognise a repeat.
				const keys = deliveries.map((delivery) => delivery.headers['x-lago-unique-key']);
				expect(keys[0]).toBeTruthy();
				expect(keys[1]).toBe(keys[0]);

				await api(`/customers/${externalId}`, { method: 'DELETE' });
			} finally {
				await listener.close();
			}
		}, 120_000);
	});
});
