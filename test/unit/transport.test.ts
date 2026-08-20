import { describe, expect, it, vi } from 'vitest';
import { NodeApiError } from 'n8n-workflow';
import { lagoApiRequest } from '../../nodes/Lago/shared/transport';
import {
	buildRequestOptions,
	cleanQuery,
	collectAll,
	extractPage,
	MAX_PAGE_SIZE,
	normalizeBaseUrl,
} from '../../nodes/Lago/shared/transport';

describe('normalizeBaseUrl', () => {
	it.each([
		['https://api.getlago.com', 'https://api.getlago.com'],
		['https://api.getlago.com/', 'https://api.getlago.com'],
		['https://api.getlago.com///', 'https://api.getlago.com'],
		['  https://api.getlago.com  ', 'https://api.getlago.com'],
		['https://billing.acme.com', 'https://billing.acme.com'],
		['http://localhost:3210', 'http://localhost:3210'],
	])('trims %s', (input, expected) => {
		expect(normalizeBaseUrl(input)).toBe(expected);
	});

	// Stripped rather than rejected: users paste whichever spelling their deployment shows them,
	// and appending blindly would produce /api/v1/api/v1 and 404 on every call.
	it.each([
		['https://api.getlago.com/api/v1', 'https://api.getlago.com'],
		['https://api.getlago.com/api/v1/', 'https://api.getlago.com'],
		['http://localhost:3210/api/v1', 'http://localhost:3210'],
	])('strips the API prefix from %s', (input, expected) => {
		expect(normalizeBaseUrl(input)).toBe(expected);
	});

	it('does not strip a path that merely looks similar', () => {
		expect(normalizeBaseUrl('https://acme.test/lago/api/v1/proxy')).toBe(
			'https://acme.test/lago/api/v1/proxy',
		);
	});

	it('rejects an empty base URL', () => {
		expect(() => normalizeBaseUrl('')).toThrow(/No Base URL/);
		expect(() => normalizeBaseUrl('   ')).toThrow(/No Base URL/);
	});

	it('rejects a base URL with no scheme, which would silently resolve wrong', () => {
		expect(() => normalizeBaseUrl('api.getlago.com')).toThrow(/must start with http/);
	});
});

describe('cleanQuery', () => {
	it('drops undefined, null and empty strings but keeps meaningful falsy values', () => {
		expect(cleanQuery({ a: undefined, b: null, c: '', d: 0, e: false, f: 'x' })).toEqual({
			d: 0,
			e: false,
			f: 'x',
		});
	});

	it('returns an empty object for no input', () => {
		expect(cleanQuery()).toEqual({});
	});
});

describe('buildRequestOptions', () => {
	it('inserts the API prefix between the host root and the path', () => {
		const request = buildRequestOptions('https://api.getlago.com', 'GET', '/customers');
		expect(request.url).toBe('https://api.getlago.com/api/v1/customers');
	});

	it('does not double the prefix when the credential already carries it', () => {
		const request = buildRequestOptions('https://api.getlago.com/api/v1/', 'GET', '/customers');
		expect(request.url).toBe('https://api.getlago.com/api/v1/customers');
	});

	it('omits a body when none is given, so GET stays bodyless', () => {
		expect(buildRequestOptions('https://x.test', 'GET', '/customers').body).toBeUndefined();
	});

	it('passes a body through for writes', () => {
		const request = buildRequestOptions('https://x.test', 'POST', '/customers', {
			body: { customer: { external_id: 'acme' } },
		});
		expect(request.body).toEqual({ customer: { external_id: 'acme' } });
	});
});

describe('extractPage', () => {
	// Captured from a live Lago instance.
	it('reads the collection and the pagination cursor', () => {
		const page = extractPage(
			{
				customers: [{ external_id: 'a' }, { external_id: 'b' }],
				meta: { current_page: 1, next_page: 2, prev_page: null, total_pages: 3, total_count: 5 },
			},
			'customers',
		);
		expect(page.items).toHaveLength(2);
		expect(page.nextPage).toBe(2);
		expect(page.totalCount).toBe(5);
	});

	it('treats a null next_page as the last page', () => {
		const page = extractPage({ customers: [], meta: { next_page: null } }, 'customers');
		expect(page.nextPage).toBeUndefined();
	});

	it('tolerates a response with no meta at all', () => {
		expect(extractPage({ customers: [] }, 'customers').nextPage).toBeUndefined();
	});

	it('fails loudly when the collection key is missing', () => {
		expect(() => extractPage({ meta: {} }, 'customers')).toThrow(/no "customers" collection/);
	});
});

describe('collectAll', () => {
	/** Serves `total` records in pages, the way Lago does. */
	function pagedSource(total: number) {
		return vi.fn(async ({ page, perPage }: { page: number; perPage: number }) => {
			const start = (page - 1) * perPage;
			const items = Array.from(
				{ length: Math.max(0, Math.min(perPage, total - start)) },
				(_, i) => ({
					id: start + i,
				}),
			);
			const consumed = start + items.length;
			return { items, nextPage: consumed < total ? page + 1 : undefined, totalCount: total };
		});
	}

	it('walks every page when returnAll is set', async () => {
		const fetchPage = pagedSource(250);
		const items = await collectAll(fetchPage, { returnAll: true, limit: 0 });
		expect(items).toHaveLength(250);
		expect(fetchPage).toHaveBeenCalledTimes(3);
	});

	it('stops at the limit and trims the final page', async () => {
		const fetchPage = pagedSource(250);
		const items = await collectAll(fetchPage, { returnAll: false, limit: 120 });
		expect(items).toHaveLength(120);
		expect(items[119]).toEqual({ id: 119 });
	});

	it('asks for no more per page than the limit needs', async () => {
		const fetchPage = pagedSource(250);
		await collectAll(fetchPage, { returnAll: false, limit: 5 });
		expect(fetchPage).toHaveBeenCalledWith({ page: 1, perPage: 5 });
		expect(fetchPage).toHaveBeenCalledTimes(1);
	});

	it('never exceeds the page-size ceiling', async () => {
		const fetchPage = pagedSource(10);
		await collectAll(fetchPage, { returnAll: true, limit: 0, pageSize: 5_000 });
		expect(fetchPage).toHaveBeenCalledWith({ page: 1, perPage: MAX_PAGE_SIZE });
	});

	it('returns nothing for a non-positive limit without calling the server', async () => {
		const fetchPage = pagedSource(10);
		expect(await collectAll(fetchPage, { returnAll: false, limit: 0 })).toEqual([]);
		expect(fetchPage).not.toHaveBeenCalled();
	});

	it('stops on an empty page even when the cursor keeps pointing forward', async () => {
		const fetchPage = vi.fn(async () => ({ items: [], nextPage: 2 }));
		expect(await collectAll(fetchPage, { returnAll: true, limit: 0 })).toEqual([]);
		expect(fetchPage).toHaveBeenCalledTimes(1);
	});

	// Without the guard this spins forever, and the loop runs against self-hosted instances of
	// any age.
	it('stops instead of looping when the server repeats a page', async () => {
		const fetchPage = vi.fn(async () => ({ items: [{ id: 1 }], nextPage: 1 }));
		const items = await collectAll(fetchPage, { returnAll: true, limit: 0 });
		expect(items).toEqual([{ id: 1 }]);
		expect(fetchPage).toHaveBeenCalledTimes(1);
	});

	it('honours a cursor that skips ahead rather than assuming page + 1', async () => {
		const fetchPage = vi
			.fn()
			.mockResolvedValueOnce({ items: [{ id: 1 }], nextPage: 7 })
			.mockResolvedValueOnce({ items: [{ id: 2 }], nextPage: undefined });
		await collectAll(fetchPage, { returnAll: true, limit: 0 });
		expect(fetchPage).toHaveBeenNthCalledWith(2, { page: 7, perPage: MAX_PAGE_SIZE });
	});
});

describe('lagoApiRequest error reporting', () => {
	const node = {
		id: 'n',
		name: 'Lago',
		type: 't',
		typeVersion: 1,
		position: [0, 0],
		parameters: {},
	};

	function contextThrowing(error: unknown) {
		return {
			getNode: () => node,
			getCredentials: async () => ({ baseUrl: 'https://api.getlago.com', apiKey: 'k' }),
			helpers: {
				httpRequestWithAuthentication: async () => {
					throw error;
				},
			},
		};
	}

	/** The shape n8n's helper throws: a NodeApiError keeping the transport error as `cause`. */
	function n8nWrapped(status: number, body: unknown) {
		const inner = Object.assign(new Error(`Request failed with status code ${status}`), {
			isAxiosError: true,
			response: { status, data: body },
		});
		return new NodeApiError(node, inner as never);
	}

	// The wrapper here is built from the same NodeApiError class the transport uses, which is what
	// a real install looks like: node and host share one copy of n8n-workflow. Re-wrapping such an
	// error returns it unchanged and discards our message, so this fails if the transport stops
	// unwrapping. Local development hides the bug, because the project and n8n resolve separate
	// copies and the instanceof check misses.
	it('reports our message rather than the generic n8n wording', async () => {
		const error = n8nWrapped(404, { status: 404, error: 'Not Found', code: 'customer_not_found' });
		const context = contextThrowing(error);

		await expect(
			lagoApiRequest.call(context as never, 'GET', '/customers/acme', {
				resource: 'Customer',
				resourceId: 'acme',
			}),
		).rejects.toThrow('Customer acme was not found');
	});

	it('carries the Lago validation wording out of a wrapped 422', async () => {
		const error = n8nWrapped(422, {
			status: 422,
			code: 'validation_errors',
			error_details: { external_id: ['value_is_mandatory'] },
		});

		await expect(
			lagoApiRequest.call(contextThrowing(error) as never, 'POST', '/customers', {
				resource: 'Customer',
			}),
		).rejects.toThrow('external_id: value_is_mandatory');
	});

	it('reports a malformed base URL as configuration, not as a failed request', async () => {
		const context = {
			getNode: () => node,
			getCredentials: async () => ({ baseUrl: 'not-a-url', apiKey: 'k' }),
			helpers: { httpRequestWithAuthentication: async () => ({}) },
		};

		await expect(lagoApiRequest.call(context as never, 'GET', '/customers')).rejects.toThrow(
			/must start with http/,
		);
	});
});
