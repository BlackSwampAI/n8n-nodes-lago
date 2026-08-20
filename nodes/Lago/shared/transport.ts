import {
	NodeApiError,
	NodeOperationError,
	type IDataObject,
	type IExecuteFunctions,
	type IHttpRequestMethods,
	type IHttpRequestOptions,
	type ILoadOptionsFunctions,
	type JsonObject,
} from 'n8n-workflow';
import { describeLagoError, rootHttpError } from './errors';

export const LAGO_CREDENTIAL = 'lagoApi';

/** Every REST route lives under this prefix; the credential holds only the host root. */
export const API_PREFIX = '/api/v1';

/** Lago's own ceiling for `per_page`. Larger values are clamped by the server anyway. */
export const MAX_PAGE_SIZE = 100;

export type LagoContext = IExecuteFunctions | ILoadOptionsFunctions;

/**
 * Trims a credential's base URL into the host root that paths are appended to.
 *
 * A trailing `/api/v1` is stripped rather than rejected. Lago's documentation uses the host
 * root, but its own examples and self-hosted deployments use both spellings, and users paste
 * whichever they have. Rejecting one of them would be correct-by-the-book and useless in
 * practice; appending blindly would produce `/api/v1/api/v1` and 404 on every call.
 *
 * Genuinely unusable input throws instead, because a silently wrong base URL produces 404s that
 * read like missing data rather than a misconfigured credential.
 */
export function normalizeBaseUrl(rawBaseUrl: string): string {
	const baseUrl = (rawBaseUrl ?? '').trim();

	if (!baseUrl) {
		throw new Error('No Base URL is set on the Lago credential.');
	}

	if (!/^https?:\/\//i.test(baseUrl)) {
		throw new Error(
			`The Lago Base URL must start with http:// or https:// (received "${baseUrl}").`,
		);
	}

	return baseUrl.replace(/\/+$/, '').replace(/\/api\/v\d+$/i, '');
}

/** Drops undefined, null and empty-string query values so they never reach the URL. */
export function cleanQuery(query: IDataObject = {}): IDataObject {
	const cleaned: IDataObject = {};
	for (const [key, value] of Object.entries(query)) {
		if (value === undefined || value === null || value === '') continue;
		cleaned[key] = value;
	}
	return cleaned;
}

export interface LagoRequestOptions {
	query?: IDataObject;
	body?: IDataObject;
}

/** One page of a Lago list endpoint. */
export interface LagoPage<T> {
	items: T[];
	/** Page number to request next, or undefined when this was the last page. */
	nextPage?: number;
	/** Total matching records, when Lago reported one. */
	totalCount?: number;
}

export interface CollectOptions {
	/** Fetch every matching record, ignoring `limit`. */
	returnAll: boolean;
	/** Maximum records to return when `returnAll` is false. */
	limit: number;
	/** Records per request. Capped at MAX_PAGE_SIZE. */
	pageSize?: number;
}

/**
 * Reads the collection and pagination cursor out of a Lago list response.
 *
 * Responses are shaped `{ customers: [...], meta: { current_page, next_page, ... } }`, with the
 * collection under a key named after the resource. `meta.next_page` is null on the final page,
 * which is the authoritative stop condition — Lago sends no Link header, so the header-walking
 * pattern used by other n8n nodes does not apply here.
 */
export function extractPage<T>(response: unknown, collectionKey: string): LagoPage<T> {
	const body = (response ?? {}) as JsonObject;
	const items = body[collectionKey];

	if (!Array.isArray(items)) {
		throw new Error(
			`Lago returned no "${collectionKey}" collection. The response did not have the expected shape.`,
		);
	}

	const meta = (body.meta ?? {}) as JsonObject;
	const nextPage = typeof meta.next_page === 'number' ? meta.next_page : undefined;
	const totalCount = typeof meta.total_count === 'number' ? meta.total_count : undefined;

	return { items: items as T[], nextPage, totalCount };
}

/**
 * Walks a Lago list endpoint to completion.
 *
 * `fetchPage` is injected, which keeps the loop free of any n8n or HTTP dependency and therefore
 * directly testable. Pages are fetched sequentially rather than in parallel: Lago rate limits
 * general endpoints to 50 requests per second per organization, shared across every API key, and
 * a parallel fan-out over a large customer base would spend that budget for no real gain.
 */
export async function collectAll<T>(
	fetchPage: (params: { page: number; perPage: number }) => Promise<LagoPage<T>>,
	options: CollectOptions,
): Promise<T[]> {
	const { returnAll, limit } = options;

	if (!returnAll && limit <= 0) return [];

	const perPage = Math.min(
		options.pageSize ?? MAX_PAGE_SIZE,
		MAX_PAGE_SIZE,
		returnAll ? MAX_PAGE_SIZE : limit,
	);

	const collected: T[] = [];
	let page = 1;
	const seen = new Set<number>();

	for (;;) {
		// A server that keeps pointing at a page it has already served would otherwise spin
		// forever, and this loop can run against self-hosted instances of any age.
		if (seen.has(page)) break;
		seen.add(page);

		const result = await fetchPage({ page, perPage });
		collected.push(...result.items);

		if (result.items.length === 0) break;
		if (!returnAll && collected.length >= limit) break;
		if (result.nextPage === undefined) break;

		page = result.nextPage;
	}

	return returnAll ? collected : collected.slice(0, limit);
}

/** Builds the request n8n will send, with authentication supplied by the credential. */
export function buildRequestOptions(
	baseUrl: string,
	method: IHttpRequestMethods,
	path: string,
	options: LagoRequestOptions = {},
): IHttpRequestOptions {
	const request: IHttpRequestOptions = {
		method,
		url: `${normalizeBaseUrl(baseUrl)}${API_PREFIX}${path}`,
		qs: cleanQuery(options.query),
		json: true,
	};

	if (options.body !== undefined) request.body = options.body;

	return request;
}

/** Issues a single authenticated request against the Lago API. */
export async function lagoApiRequest(
	this: LagoContext,
	method: IHttpRequestMethods,
	path: string,
	options: LagoRequestOptions & { resource?: string; resourceId?: string } = {},
): Promise<JsonObject> {
	const credentials = await this.getCredentials(LAGO_CREDENTIAL);
	const baseUrl = String(credentials.baseUrl ?? '');

	let request: IHttpRequestOptions;
	try {
		request = buildRequestOptions(baseUrl, method, path, options);
	} catch (error) {
		// A malformed base URL is the user's configuration, not a failed API call, so it should
		// not be reported as one.
		throw new NodeOperationError(this.getNode(), (error as Error).message);
	}

	try {
		return (await this.helpers.httpRequestWithAuthentication.call(
			this,
			LAGO_CREDENTIAL,
			request,
		)) as JsonObject;
	} catch (error) {
		const described = describeLagoError(error, {
			resource: options.resource,
			resourceId: options.resourceId,
			baseUrl: normalizeBaseUrl(baseUrl),
		});

		// Two things here are deliberate, and both were found by running the node in n8n rather
		// than by any test.
		//
		// The underlying transport error is passed on, not the NodeApiError that n8n's request
		// helper has already wrapped it in. NodeApiError's constructor returns its argument
		// unchanged when handed one of its own instances, which would discard everything below.
		// That only bites in a real install, where the node and n8n share one copy of
		// n8n-workflow so the instanceof check matches; in local development the two resolve
		// separate copies and the re-wrap appears to work.
		//
		// The message is then assigned rather than passed as an option, because NodeApiError
		// overwrites the message it was given whenever the status code is one it recognises —
		// 401, 404 and 422 among them — with generic wording such as "The resource you are
		// requesting could not be found". Assigning afterwards is what makes a message naming the
		// resource, or Lago's own validation wording, actually reach the user.
		const apiError = new NodeApiError(this.getNode(), rootHttpError(error) as JsonObject, {
			description: described.description,
		});
		apiError.message = described.message;
		throw apiError;
	}
}

/**
 * Issues requests against a Lago list endpoint until the requested records are collected.
 *
 * Takes its context as an argument rather than through `this`, unlike {@link lagoApiRequest}.
 * A generic function's type parameter cannot be inferred through `Function.prototype.call`, so
 * the `this`-bound form would force every caller into an explicit cast or a type-argument list.
 */
export async function lagoApiRequestAllItems<T = JsonObject>(
	context: LagoContext,
	path: string,
	collectionKey: string,
	options: CollectOptions & { query?: IDataObject; resource?: string },
): Promise<T[]> {
	return collectAll<T>(async ({ page, perPage }) => {
		const response = await lagoApiRequest.call(context, 'GET', path, {
			query: { ...options.query, page, per_page: perPage },
			resource: options.resource,
		});
		return extractPage<T>(response, collectionKey);
	}, options);
}
