import { afterAll, describe, expect, it } from 'vitest';
import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { routeOperations } from '../../nodes/Lago/shared/router';
import { WEBHOOK_EVENT_TYPES } from '../../nodes/Lago/shared/webhookEventTypes';
import { createExecuteContext } from '../support/context';
import { hasLago, lagoApiKey, lagoBaseUrl } from '../support/env.mjs';

const describeLago = hasLago ? describe : describe.skip;

const runId = `t${Date.now().toString(36)}`;
const created = new Set<string>();

async function run(parameters: Record<string, unknown>) {
	const context = createExecuteContext({
		parameters: { resource: 'webhookEndpoint', ...parameters },
		baseUrl: String(lagoBaseUrl),
		apiKey: String(lagoApiKey),
	});
	const output: INodeExecutionData[][] = await routeOperations.call(
		context as unknown as IExecuteFunctions,
	);
	return output[0];
}

async function createEndpoint(path: string, additionalFields: Record<string, unknown> = {}) {
	const [item] = await run({
		operation: 'create',
		webhookUrl: `https://example.test/${runId}/${path}`,
		additionalFields,
	});
	created.add(String(item.json.lago_id));
	return item.json;
}

describeLago('Webhook Endpoint resource against a live Lago instance', () => {
	afterAll(async () => {
		for (const endpointId of created) {
			await run({ operation: 'delete', endpointId }).catch(() => undefined);
		}
	}, 60_000);

	describe('registering', () => {
		it('registers an endpoint for every event by default', async () => {
			const endpoint = await createEndpoint('all');
			expect(endpoint.webhook_url).toContain(runId);
			// An empty selection means all events, which is Lago's own default, so the key is
			// omitted rather than sent empty.
			expect(endpoint.event_types).toBeNull();
			expect(endpoint.webhook_endpoint).toBeUndefined();
		});

		it('subscribes to specific events', async () => {
			const endpoint = await createEndpoint('selected', {
				event_types: ['invoice.created', 'customer.created'],
				name: 'Selected',
			});
			expect(endpoint.event_types).toEqual(['invoice.created', 'customer.created']);
			expect(endpoint.name).toBe('Selected');
		});

		it.each(['jwt', 'hmac'])('registers an endpoint signed with %s', async (algo) => {
			const endpoint = await createEndpoint(`algo-${algo}`, { signature_algo: algo });
			expect(endpoint.signature_algo).toBe(algo);
		});
	});

	// The generated list is what makes the multi-select safe. If it drifts from Lago's own list,
	// a workflow author picks an event that is then rejected.
	describe('the generated event catalogue', () => {
		it('is accepted in full by Lago', async () => {
			const everyEvent = WEBHOOK_EVENT_TYPES.map((entry) => String(entry.value));
			const endpoint = await createEndpoint('every-event', { event_types: everyEvent });
			expect(endpoint.event_types).toHaveLength(everyEvent.length);
		});

		it('excludes the deprecated event Lago no longer documents', () => {
			expect(WEBHOOK_EVENT_TYPES.map((entry) => entry.value)).not.toContain('event.error');
		});

		// The OpenAPI specification documents these events with underscores, and Lago rejects
		// that form. The generated list uses the dotted names it validates against.
		it('uses the dotted names, which are the ones Lago accepts', async () => {
			const response = await fetch(`${lagoBaseUrl}/api/v1/webhook_endpoints`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${lagoApiKey}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					webhook_endpoint: {
						webhook_url: `https://example.test/${runId}/underscored`,
						event_types: ['invoice_created'],
					},
				}),
			});
			expect(response.status).toBe(422);
			expect(JSON.stringify(await response.json())).toMatch(/contains invalid types/);
		});
	});

	describe('reading and changing', () => {
		it('lists endpoints', async () => {
			const items = await run({ operation: 'getAll', returnAll: true });
			expect(items.length).toBeGreaterThanOrEqual(created.size);
		});

		it('gets an endpoint by ID', async () => {
			const endpointId = [...created][0];
			const [item] = await run({ operation: 'get', endpointId });
			expect(item.json.lago_id).toBe(endpointId);
		});

		it('changes the events an endpoint receives', async () => {
			const endpointId = [...created][0];
			const [item] = await run({
				operation: 'update',
				endpointId,
				webhookUrl: '',
				additionalFields: { event_types: ['plan.created'] },
			});
			expect(item.json.event_types).toEqual(['plan.created']);
		});

		it('deletes an endpoint', async () => {
			const endpoint = await createEndpoint('doomed');
			const endpointId = String(endpoint.lago_id);

			await run({ operation: 'delete', endpointId });
			created.delete(endpointId);

			await expect(run({ operation: 'get', endpointId })).rejects.toThrow(/was not found/);
		});
	});
});
