import type { IExecuteFunctions, JsonObject } from 'n8n-workflow';

/**
 * One operation on one resource.
 *
 * Handlers run once per input item and return either a single record or, for list operations,
 * the whole collection. The router flattens the result and pairs output back to the input item
 * it came from.
 */
export type OperationHandler = (
	this: IExecuteFunctions,
	index: number,
) => Promise<JsonObject | JsonObject[]>;

export type OperationHandlers = Record<string, OperationHandler>;
