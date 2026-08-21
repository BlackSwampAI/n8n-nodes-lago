import type { IDataObject, INodeProperties, JsonObject } from 'n8n-workflow';
import { lagoApiRequest, lagoApiRequestAllItems } from '../../shared/transport';
import { listPaginationFields } from '../../shared/descriptions';
import { WEBHOOK_EVENT_TYPES } from '../../shared/webhookEventTypes';
import type { OperationHandler, OperationHandlers } from '../../shared/types';

const showOnly = { resource: ['webhookEndpoint'] };
const scope = (operation: string) => ({ resource: ['webhookEndpoint'], operation: [operation] });

export const SIGNATURE_ALGOS = [
	{
		name: 'JWT',
		value: 'jwt',
		description: 'Lago’s default. The verification key is fetched from the API automatically.',
	},
	{
		name: 'HMAC',
		value: 'hmac',
		description: 'Shorter header. Verification needs the organization HMAC key from the Lago app.',
	},
];

/** Webhook endpoints are addressed by Lago's own UUID. */
function endpointIdField(operation: string): INodeProperties {
	return {
		displayName: 'Webhook Endpoint ID',
		name: 'endpointId',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. 1a901a90-1a90-1a90-1a90-1a901a901a90',
		description: 'Lago’s internal ID for the endpoint, returned as lago_id by Get Many',
		displayOptions: { show: scope(operation) },
	};
}

function endpointFields(operation: 'create' | 'update'): INodeProperties[] {
	return [
		{
			displayName: 'Webhook URL',
			name: 'webhookUrl',
			type: 'string',
			default: '',
			required: operation === 'create',
			placeholder: 'e.g. https://example.com/hooks/lago',
			description: 'Where Lago sends the events',
			displayOptions: { show: scope(operation) },
		},
		{
			displayName: 'Additional Fields',
			name: 'additionalFields',
			type: 'collection',
			placeholder: 'Add Field',
			default: {},
			displayOptions: { show: scope(operation) },
			options: [
				{
					displayName: 'Event Types',
					name: 'event_types',
					type: 'multiOptions',
					default: [],
					// Lago validates these against its own list and rejects anything else, including
					// the underscored names the OpenAPI specification uses. Leaving the field empty
					// subscribes the endpoint to everything.
					description:
						'Events this endpoint receives. Leave empty to receive all of them. Lago rejects any name outside this list.',
					options: WEBHOOK_EVENT_TYPES,
				},
				{
					displayName: 'Name',
					name: 'name',
					type: 'string',
					default: '',
					placeholder: 'e.g. Production',
				},
				{
					displayName: 'Signature Algorithm',
					name: 'signature_algo',
					type: 'options',
					default: 'jwt',
					description: 'How Lago signs the payload so the receiver can verify it',
					options: SIGNATURE_ALGOS,
				},
			],
		},
	];
}

export const webhookEndpointDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		default: 'getAll',
		displayOptions: { show: showOnly },
		options: [
			{
				name: 'Create',
				value: 'create',
				action: 'Create a webhook endpoint',
				// Lago caps an organization at ten endpoints.
				description:
					'Register a URL to receive Lago events. An organization may have at most ten endpoints.',
			},
			{
				name: 'Delete',
				value: 'delete',
				action: 'Delete a webhook endpoint',
				description: 'Stop sending events to a URL',
			},
			{
				name: 'Get',
				value: 'get',
				action: 'Get a webhook endpoint',
				description: 'Retrieve a single webhook endpoint',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many webhook endpoints',
				description: 'Retrieve many webhook endpoints',
			},
			{
				name: 'Update',
				value: 'update',
				action: 'Update a webhook endpoint',
				description: 'Update a webhook endpoint',
			},
		],
	},
	...endpointFields('create'),
	endpointIdField('update'),
	...endpointFields('update'),
	endpointIdField('get'),
	endpointIdField('delete'),
	...listPaginationFields(scope('getAll')),
];

function readEndpoint(
	get: (name: string, fallback?: unknown) => unknown,
	options: { requireUrl: boolean },
): IDataObject {
	const additionalFields = (get('additionalFields', {}) ?? {}) as IDataObject;
	const webhookUrl = String(get('webhookUrl', '') ?? '').trim();

	const endpoint: IDataObject = { ...additionalFields };
	if (webhookUrl || options.requireUrl) endpoint.webhook_url = webhookUrl;

	// An empty selection means every event, which is Lago's own default, so the key is omitted
	// rather than sent as an empty array.
	if (Array.isArray(endpoint.event_types) && endpoint.event_types.length === 0) {
		delete endpoint.event_types;
	}

	return endpoint;
}

const create: OperationHandler = async function (index) {
	const get = (name: string, fallback?: unknown) => this.getNodeParameter(name, index, fallback);

	const response = await lagoApiRequest.call(this, 'POST', '/webhook_endpoints', {
		body: { webhook_endpoint: readEndpoint(get, { requireUrl: true }) },
		resource: 'Webhook Endpoint',
	});

	return response.webhook_endpoint as JsonObject;
};

const update: OperationHandler = async function (index) {
	const endpointId = this.getNodeParameter('endpointId', index) as string;
	const get = (name: string, fallback?: unknown) => this.getNodeParameter(name, index, fallback);

	const response = await lagoApiRequest.call(
		this,
		'PUT',
		`/webhook_endpoints/${encodeURIComponent(endpointId)}`,
		{
			body: { webhook_endpoint: readEndpoint(get, { requireUrl: false }) },
			resource: 'Webhook Endpoint',
			resourceId: endpointId,
		},
	);

	return response.webhook_endpoint as JsonObject;
};

const get: OperationHandler = async function (index) {
	const endpointId = this.getNodeParameter('endpointId', index) as string;
	const response = await lagoApiRequest.call(
		this,
		'GET',
		`/webhook_endpoints/${encodeURIComponent(endpointId)}`,
		{ resource: 'Webhook Endpoint', resourceId: endpointId },
	);
	return response.webhook_endpoint as JsonObject;
};

const getAll: OperationHandler = async function (index) {
	const returnAll = this.getNodeParameter('returnAll', index, false) as boolean;
	const limit = returnAll ? 0 : (this.getNodeParameter('limit', index, 50) as number);

	return lagoApiRequestAllItems<JsonObject>(this, '/webhook_endpoints', 'webhook_endpoints', {
		returnAll,
		limit,
		resource: 'Webhook Endpoint',
	});
};

const remove: OperationHandler = async function (index) {
	const endpointId = this.getNodeParameter('endpointId', index) as string;
	const response = await lagoApiRequest.call(
		this,
		'DELETE',
		`/webhook_endpoints/${encodeURIComponent(endpointId)}`,
		{ resource: 'Webhook Endpoint', resourceId: endpointId },
	);
	return response.webhook_endpoint as JsonObject;
};

export const webhookEndpointOperations: OperationHandlers = {
	create,
	update,
	get,
	getAll,
	delete: remove,
};
