import type { IDataObject, INodeProperties, JsonObject } from 'n8n-workflow';
import { lagoApiRequestAllItems } from '../../shared/transport';
import { listPaginationFields } from '../../shared/descriptions';
import type { OperationHandler } from '../../shared/types';

const show = { resource: ['customer'], operation: ['getAll'] };

export const getAllFields: INodeProperties[] = [
	...listPaginationFields(show),
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show },
		options: [
			{
				displayName: 'Account Type',
				name: 'account_type',
				type: 'multiOptions',
				default: [],
				options: [
					{ name: 'Customer', value: 'customer' },
					{ name: 'Partner', value: 'partner' },
				],
			},
			{
				displayName: 'Billing Entity Codes',
				name: 'billing_entity_codes',
				type: 'string',
				default: '',
				placeholder: 'e.g. acme-eu,acme-us',
				description: 'Comma-separated billing entity codes to filter by',
			},
			{
				displayName: 'Countries',
				name: 'countries',
				type: 'string',
				default: '',
				placeholder: 'e.g. US,FR',
				description: 'Comma-separated two-letter ISO 3166-1 alpha-2 country codes',
			},
			{
				displayName: 'Search Term',
				name: 'search_term',
				type: 'string',
				default: '',
				description:
					'Matches against name, first name, last name, legal name, external ID and email',
			},
		],
	},
];

/** Turns a comma-separated field into the array Lago's repeated query parameters expect. */
function toList(value: unknown): string[] | undefined {
	if (typeof value !== 'string') return undefined;
	const entries = value
		.split(',')
		.map((entry) => entry.trim())
		.filter(Boolean);
	return entries.length ? entries : undefined;
}

export const getAll: OperationHandler = async function (index) {
	const returnAll = this.getNodeParameter('returnAll', index, false) as boolean;
	const limit = returnAll ? 0 : (this.getNodeParameter('limit', index, 50) as number);
	const filters = this.getNodeParameter('filters', index, {}) as IDataObject;

	// Arrays are passed as arrays rather than pre-joined: n8n's HTTP helper is axios underneath,
	// which already serialises them as `key[]=value`, which is the form Lago expects.
	const query: IDataObject = {
		search_term: filters.search_term,
		account_type: Array.isArray(filters.account_type) ? filters.account_type : undefined,
		billing_entity_codes: toList(filters.billing_entity_codes),
		countries: toList(filters.countries),
	};

	return lagoApiRequestAllItems<JsonObject>(this, '/customers', 'customers', {
		returnAll,
		limit,
		query,
		resource: 'Customer',
	});
};
