import type { IDataObject, INodeProperties, JsonObject } from 'n8n-workflow';
import { lagoApiRequest } from '../../shared/transport';
import type { OperationHandler } from '../../shared/types';

const show = { resource: ['invoice'], operation: ['create'] };

export const createFields: INodeProperties[] = [
	{
		displayName: 'Customer External ID',
		name: 'externalCustomerId',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. acme-corp',
		displayOptions: { show },
	},
	{
		displayName: 'Currency',
		name: 'currency',
		type: 'string',
		default: 'USD',
		required: true,
		placeholder: 'e.g. USD',
		description: 'Three-letter ISO 4217 currency code',
		displayOptions: { show },
	},
	{
		displayName: 'Fees',
		name: 'fees',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		placeholder: 'Add Fee',
		default: {},
		required: true,
		// A one-off invoice is built from add-ons, which are defined in Lago rather than here.
		description:
			'Lines on the invoice. Each references an add-on that already exists in Lago, since a one-off invoice is billed from add-ons rather than from usage.',
		displayOptions: { show },
		options: [
			{
				displayName: 'Fee',
				name: 'fee',
				values: [
					{
						displayName: 'Add-On Code',
						name: 'add_on_code',
						type: 'string',
						default: '',
						placeholder: 'e.g. setup_fee',
						description: 'Code of an add-on defined in Lago',
					},
					{
						displayName: 'Units',
						name: 'units',
						type: 'number',
						default: 1,
					},
					{
						displayName: 'Unit Amount (Cents)',
						name: 'unit_amount_cents',
						type: 'number',
						default: 0,
						// Invoices use integer cents, unlike plan charges which use decimal strings.
						description:
							'Price per unit in the currency’s smallest unit. 5000 means 50.00. Note invoices use cents, unlike the decimal amounts on a plan charge.',
					},
					{
						displayName: 'Description',
						name: 'description',
						type: 'string',
						default: '',
					},
				],
			},
		],
	},
];

export const create: OperationHandler = async function (index) {
	const rows = this.getNodeParameter('fees.fee', index, []) as IDataObject[];

	const fees = rows.map((row) => {
		const fee: IDataObject = {
			add_on_code: row.add_on_code,
			units: Number(row.units ?? 1),
			unit_amount_cents: Number(row.unit_amount_cents ?? 0),
		};
		if (row.description) fee.description = row.description;
		return fee;
	});

	const response = await lagoApiRequest.call(this, 'POST', '/invoices', {
		body: {
			invoice: {
				external_customer_id: this.getNodeParameter('externalCustomerId', index) as string,
				currency: this.getNodeParameter('currency', index) as string,
				fees,
			},
		},
		resource: 'Invoice',
	});

	return response.invoice as JsonObject;
};
