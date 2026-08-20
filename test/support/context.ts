import type { IExecuteFunctions, IHttpRequestOptions, INode } from 'n8n-workflow';

/**
 * A stand-in for n8n's execution context, backed by real HTTP.
 *
 * Integration tests drive the shipped handlers and the shipped router through this, so what is
 * verified is the code that runs in production rather than a reimplementation of it. Only the
 * surface the node actually touches is implemented.
 */
export interface ContextOptions {
	/** Node parameters, as `getNodeParameter` would resolve them. */
	parameters: Record<string, unknown>;
	/** One entry per input item. Defaults to a single empty item. */
	items?: Array<Record<string, unknown>>;
	baseUrl: string;
	apiKey: string;
	continueOnFail?: boolean;
	/** Value returned by `getExecutionId`, which handlers use to derive idempotency keys. */
	executionId?: string;
}

const node: INode = {
	id: 'test-node',
	name: 'Lago',
	type: 'n8n-nodes-lago.lago',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};

/** Mirrors how n8n's HTTP helper surfaces a non-2xx response to node code. */
class HttpResponseError extends Error {
	constructor(
		readonly statusCode: number,
		readonly response: { status: number; body: unknown; headers: Record<string, string> },
	) {
		super(`Request failed with status code ${statusCode}`);
		this.name = 'HttpResponseError';
	}
}

export function createExecuteContext(options: ContextOptions): IExecuteFunctions {
	const items = (options.items ?? [{}]).map((json) => ({ json }));

	async function httpRequestWithAuthentication(
		_credentialType: string,
		request: IHttpRequestOptions,
	) {
		const url = new URL(String(request.url));
		for (const [key, value] of Object.entries(request.qs ?? {})) {
			if (value === undefined || value === null) continue;
			// n8n's helper is axios underneath, which serialises arrays as `key[]=value`.
			if (Array.isArray(value)) {
				for (const entry of value) url.searchParams.append(`${key}[]`, String(entry));
			} else {
				url.searchParams.append(key, String(value));
			}
		}

		const response = await fetch(url.toString(), {
			method: request.method ?? 'GET',
			headers: {
				Authorization: `Bearer ${options.apiKey}`,
				'Content-Type': 'application/json',
			},
			...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
		});

		const text = await response.text();
		let body: unknown;
		try {
			body = text ? JSON.parse(text) : {};
		} catch {
			body = text;
		}

		if (!response.ok) {
			throw new HttpResponseError(response.status, {
				status: response.status,
				body,
				headers: Object.fromEntries(response.headers.entries()),
			});
		}

		return body;
	}

	const context = {
		getInputData: () => items,
		getNode: () => node,
		getExecutionId: () => options.executionId ?? 'test-execution',
		continueOnFail: () => options.continueOnFail ?? false,
		getCredentials: async () => ({ baseUrl: options.baseUrl, apiKey: options.apiKey }),
		getNodeParameter: (name: string, _index?: number, fallback?: unknown) => {
			if (name in options.parameters) return options.parameters[name];

			// Nested lookups such as "metadata.metadata", which n8n resolves for fixedCollection.
			const [head, ...rest] = name.split('.');
			if (head in options.parameters) {
				let value: unknown = options.parameters[head];
				for (const key of rest) {
					value =
						value && typeof value === 'object'
							? (value as Record<string, unknown>)[key]
							: undefined;
				}
				if (value !== undefined) return value;
			}

			return fallback;
		},
		helpers: { httpRequestWithAuthentication },
	};

	return context as unknown as IExecuteFunctions;
}
