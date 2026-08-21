import {
	NodeConnectionTypes,
	NodeOperationError,
	type IDataObject,
	type IHookFunctions,
	type INodeType,
	type INodeTypeDescription,
	type IWebhookFunctions,
	type IWebhookResponseData,
	type JsonObject,
} from 'n8n-workflow';
import { lagoApiRequest, normalizeBaseUrl } from './shared/transport';
import { WEBHOOK_EVENT_TYPES } from './shared/webhookEventTypes';
import {
	expectedJwtIssuer,
	UNIQUE_KEY_HEADER,
	verifyLagoWebhookSignature,
	type LagoSignatureAlgorithm,
} from './shared/webhookSignature';

/**
 * How many delivery identifiers to remember for deduplication.
 *
 * Lago retries a webhook three times on any non-2xx response, and gives every delivery a stable
 * `X-Lago-Unique-Key`. Remembering recent keys turns those retries into no-ops. The window is
 * bounded because it lives in the workflow's static data, which is persisted on every change.
 */
const DEDUPE_WINDOW = 200;

type StaticData = { seenKeys?: string[]; publicKey?: string };

// usableAsTool is deliberately absent. A trigger is started by Lago rather than called by a
// model, so it cannot be a tool — and the type only admits `true`, leaving omission as the only
// way to say no.
// eslint-disable-next-line @n8n/community-nodes/node-usable-as-tool
export class LagoTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Lago Trigger',
		name: 'lagoTrigger',
		icon: { light: 'file:../../icons/lago.svg', dark: 'file:../../icons/lago.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["events"].length + " event(s)"}}',
		description: 'Starts a workflow when Lago sends a billing event',
		defaults: { name: 'Lago Trigger' },
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'lagoApi', required: true }],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				default: [],
				required: true,
				// Lago filters server-side, so subscribing narrowly means the workflow is not woken
				// for events it would only discard.
				description:
					'Events to receive. Lago filters these on its side, so the workflow only runs for the ones selected.',
				options: WEBHOOK_EVENT_TYPES,
			},
			{
				displayName: 'Signature Algorithm',
				name: 'signatureAlgorithm',
				type: 'options',
				default: 'jwt',
				description:
					'How Lago signs deliveries. Every delivery is verified before the workflow runs.',
				options: [
					{
						name: 'JWT',
						value: 'jwt',
						description: 'Lago’s default. The verification key is fetched automatically.',
					},
					{
						name: 'HMAC',
						value: 'hmac',
						description: 'Needs the Webhook HMAC Key set on the credential',
					},
				],
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Endpoint Name',
						name: 'endpointName',
						type: 'string',
						default: '',
						placeholder: 'e.g. n8n production',
						description: 'Name for the endpoint Lago registers. Helps identify it in the Lago app.',
					},
					{
						displayName: 'Ignore Duplicate Deliveries',
						name: 'deduplicate',
						type: 'boolean',
						default: true,
						// Lago retries three times on a non-2xx response, and the workflow may have
						// succeeded before whatever caused the non-2xx.
						description:
							'Whether to skip a delivery Lago has already sent. Lago retries up to three times, so a slow or failing workflow can otherwise run more than once for the same event.',
					},
				],
			},
		],
	};

	webhookMethods = {
		default: {
			/**
			 * Looks for an endpoint already pointing at this workflow's URL.
			 *
			 * Lago caps an organization at ten endpoints, so a workflow that registered a new one on
			 * every activation would exhaust that quickly. Matching on the URL means reactivating
			 * reuses the endpoint rather than adding another.
			 */
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const webhookUrl = this.getNodeWebhookUrl('default');
				const response = await lagoApiRequest.call(this as never, 'GET', '/webhook_endpoints', {
					query: { per_page: 100 },
					resource: 'Webhook Endpoint',
				});

				const endpoints = (response.webhook_endpoints ?? []) as IDataObject[];
				const existing = endpoints.find((endpoint) => endpoint.webhook_url === webhookUrl);
				if (!existing) return false;

				this.getWorkflowStaticData('node').webhookId = existing.lago_id;
				return true;
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const webhookUrl = this.getNodeWebhookUrl('default');
				const events = this.getNodeParameter('events', []) as string[];
				const signatureAlgorithm = this.getNodeParameter('signatureAlgorithm', 'jwt') as string;
				const options = this.getNodeParameter('options', {}) as IDataObject;

				if (events.length === 0) {
					throw new NodeOperationError(
						this.getNode(),
						'Select at least one event for the trigger to listen to',
					);
				}

				const endpoint: IDataObject = {
					webhook_url: webhookUrl,
					signature_algo: signatureAlgorithm,
					event_types: events,
				};
				if (options.endpointName) endpoint.name = options.endpointName;

				const response = await lagoApiRequest.call(this as never, 'POST', '/webhook_endpoints', {
					body: { webhook_endpoint: endpoint },
					resource: 'Webhook Endpoint',
				});

				const created = response.webhook_endpoint as IDataObject | undefined;
				if (!created?.lago_id) return false;

				this.getWorkflowStaticData('node').webhookId = created.lago_id;
				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const staticData = this.getWorkflowStaticData('node');
				const webhookId = staticData.webhookId as string | undefined;
				if (!webhookId) return true;

				try {
					await lagoApiRequest.call(
						this as never,
						'DELETE',
						`/webhook_endpoints/${encodeURIComponent(webhookId)}`,
						{ resource: 'Webhook Endpoint', resourceId: webhookId },
					);
				} catch (error) {
					// Most often the endpoint was already removed in the Lago app. Deactivating a
					// workflow should not fail because of that, but the reason is logged rather than
					// discarded, since a failure here can also mean an endpoint left behind against
					// the ten-endpoint cap.
					this.logger.warn(
						`Lago Trigger could not delete webhook endpoint ${webhookId}: ${(error as Error).message}`,
					);
				} finally {
					delete staticData.webhookId;
					delete staticData.publicKey;
					delete staticData.seenKeys;
				}

				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const request = this.getRequestObject();
		const headers = this.getHeaderData() as Record<string, string | undefined>;
		const signatureAlgorithm = this.getNodeParameter('signatureAlgorithm', 'jwt') as
			| LagoSignatureAlgorithm
			| string;
		const options = this.getNodeParameter('options', {}) as IDataObject;
		const staticData = this.getWorkflowStaticData('node') as StaticData;

		// Signature verification runs over the exact bytes Lago signed, so the parsed body cannot
		// be used — re-serialising it would change whitespace and key order and never match.
		await request.readRawBody();
		const rawBody = request.rawBody;
		if (!rawBody) {
			throw new NodeOperationError(this.getNode(), 'Lago sent a webhook with no body');
		}

		const credentials = await this.getCredentials('lagoApi');
		const signature = headers['x-lago-signature'] ?? '';

		let verified: boolean;
		if (signatureAlgorithm === 'hmac') {
			const hmacKey = String(credentials.hmacKey ?? '');
			if (!hmacKey) {
				throw new NodeOperationError(
					this.getNode(),
					'Set the Webhook HMAC Key on the Lago credential, or switch this trigger to JWT',
				);
			}
			verified = verifyLagoWebhookSignature({ rawBody, signature, algorithm: 'hmac', hmacKey });
		} else {
			// Cached because it never changes for an instance, and fetching it on every delivery
			// would double the request count for no benefit.
			if (!staticData.publicKey) {
				const response = await lagoApiRequest.call(this as never, 'GET', '/webhooks/public_key', {
					resource: 'Webhook Endpoint',
				});
				staticData.publicKey = typeof response === 'string' ? response : String(response);
			}

			verified = verifyLagoWebhookSignature({
				rawBody,
				signature,
				algorithm: 'jwt',
				publicKey: staticData.publicKey,
				// Derived from the credential rather than hardcoded: a self-hosted instance issues
				// its own URL, so the documented cloud issuer would reject every delivery.
				issuer: expectedJwtIssuer(normalizeBaseUrl(String(credentials.baseUrl ?? ''))),
			});
		}

		if (!verified) {
			// Answered rather than thrown: an unverified delivery is not this workflow's business,
			// and a non-2xx would make Lago retry something that will never verify.
			return { noWebhookResponse: false, workflowData: undefined } as IWebhookResponseData;
		}

		if (options.deduplicate !== false) {
			const uniqueKey = headers[UNIQUE_KEY_HEADER];
			if (uniqueKey) {
				const seen = staticData.seenKeys ?? [];
				if (seen.includes(uniqueKey)) {
					return { workflowData: undefined } as IWebhookResponseData;
				}
				staticData.seenKeys = [...seen, uniqueKey].slice(-DEDUPE_WINDOW);
			}
		}

		const body = this.getBodyData() as JsonObject;
		return { workflowData: [this.helpers.returnJsonArray([body])] };
	}
}
