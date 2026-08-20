import type { IDataObject, INodeProperties, JsonObject } from 'n8n-workflow';
import { lagoApiRequest } from '../../shared/transport';
import type { OperationHandler } from '../../shared/types';

const show = { resource: ['customer'], operation: ['createOrUpdate'] };

export const createOrUpdateFields: INodeProperties[] = [
	{
		displayName: 'External ID',
		name: 'externalId',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. acme-corp',
		description:
			'Your own identifier for this customer. Lago matches on it, so sending an ID that already exists updates that customer instead of creating a second one.',
		displayOptions: { show },
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show },
		options: [
			{
				displayName: 'Address Line 1',
				name: 'address_line1',
				type: 'string',
				default: '',
			},
			{
				displayName: 'Address Line 2',
				name: 'address_line2',
				type: 'string',
				default: '',
			},
			{
				displayName: 'City',
				name: 'city',
				type: 'string',
				default: '',
			},
			{
				displayName: 'Country',
				name: 'country',
				type: 'string',
				default: '',
				placeholder: 'e.g. US',
				description: 'Two-letter ISO 3166-1 alpha-2 country code',
			},
			{
				displayName: 'Currency',
				name: 'currency',
				type: 'string',
				default: '',
				placeholder: 'e.g. USD',
				description:
					'Three-letter ISO 4217 currency code. Lago fixes this once the customer has a wallet or an invoice, so it cannot be changed freely afterwards.',
			},
			{
				displayName: 'Customer Type',
				name: 'customer_type',
				type: 'options',
				default: 'company',
				options: [
					{ name: 'Company', value: 'company' },
					{ name: 'Individual', value: 'individual' },
				],
			},
			{
				displayName: 'Email',
				name: 'email',
				type: 'string',
				placeholder: 'name@email.com',
				default: '',
			},
			{
				displayName: 'First Name',
				name: 'firstname',
				type: 'string',
				default: '',
			},
			{
				displayName: 'Last Name',
				name: 'lastname',
				type: 'string',
				default: '',
			},
			{
				displayName: 'Legal Name',
				name: 'legal_name',
				type: 'string',
				default: '',
			},
			{
				displayName: 'Legal Number',
				name: 'legal_number',
				type: 'string',
				default: '',
			},
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
			},
			{
				displayName: 'Phone',
				name: 'phone',
				type: 'string',
				default: '',
			},
			{
				displayName: 'State',
				name: 'state',
				type: 'string',
				default: '',
			},
			{
				displayName: 'Tax Identification Number',
				name: 'tax_identification_number',
				type: 'string',
				default: '',
			},
			{
				displayName: 'Timezone',
				name: 'timezone',
				type: 'string',
				default: '',
				placeholder: 'e.g. Europe/Paris',
				// Accepted with a 200 and then stored as null on the free edition, so nothing
				// signals that the customer stayed on the organization's timezone.
				description:
					'IANA timezone name. Requires a Lago premium licence — the free edition accepts the value and silently ignores it, leaving the customer on the organization’s timezone.',
			},
			{
				displayName: 'URL',
				name: 'url',
				type: 'string',
				default: '',
			},
			{
				displayName: 'Zip Code',
				name: 'zipcode',
				type: 'string',
				default: '',
			},
		],
	},
	{
		displayName: 'Metadata',
		name: 'metadata',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		placeholder: 'Add Metadata',
		default: {},
		description: 'Key/value pairs stored on the customer, optionally shown on their invoices',
		displayOptions: { show },
		options: [
			{
				displayName: 'Metadata',
				name: 'metadata',
				values: [
					{
						displayName: 'Key',
						name: 'key',
						type: 'string',
						default: '',
					},
					{
						displayName: 'Value',
						name: 'value',
						type: 'string',
						default: '',
					},
					{
						displayName: 'Display in Invoice',
						name: 'display_in_invoice',
						type: 'boolean',
						default: false,
						description: 'Whether to show this pair on the customer’s invoices',
					},
				],
			},
		],
	},
];

export const createOrUpdate: OperationHandler = async function (index) {
	const externalId = this.getNodeParameter('externalId', index) as string;
	const additionalFields = this.getNodeParameter('additionalFields', index, {}) as IDataObject;
	const metadata = this.getNodeParameter('metadata.metadata', index, []) as IDataObject[];

	const customer: IDataObject = { external_id: externalId, ...additionalFields };

	if (metadata.length > 0) {
		customer.metadata = metadata.map((entry) => ({
			key: entry.key,
			value: entry.value,
			display_in_invoice: entry.display_in_invoice ?? false,
		}));
	}

	const response = await lagoApiRequest.call(this, 'POST', '/customers', {
		body: { customer },
		resource: 'Customer',
		resourceId: externalId,
	});

	return response.customer as JsonObject;
};
