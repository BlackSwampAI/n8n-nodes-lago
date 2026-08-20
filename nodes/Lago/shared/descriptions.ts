import type { INodeProperties } from 'n8n-workflow';

/**
 * The Return All / Limit pair every list operation uses.
 *
 * Paging is handled inside the node, so a workflow author never manipulates Lago's `page` and
 * `per_page` directly for an ordinary Get Many.
 */
export function listPaginationFields(show: {
	resource: string[];
	operation: string[];
}): INodeProperties[] {
	return [
		{
			displayName: 'Return All',
			name: 'returnAll',
			type: 'boolean',
			default: false,
			description: 'Whether to return all results or only up to a given limit',
			displayOptions: { show },
		},
		{
			displayName: 'Limit',
			name: 'limit',
			type: 'number',
			default: 50,
			typeOptions: { minValue: 1 },
			description: 'Max number of results to return',
			displayOptions: { show: { ...show, returnAll: [false] } },
		},
	];
}
