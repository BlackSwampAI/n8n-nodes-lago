import type { INodeProperties } from 'n8n-workflow';

export const PLAN_INTERVALS = [
	{ name: 'Weekly', value: 'weekly' },
	{ name: 'Monthly', value: 'monthly' },
	{ name: 'Quarterly', value: 'quarterly' },
	{ name: 'Semiannual', value: 'semiannual' },
	{ name: 'Yearly', value: 'yearly' },
];

/**
 * Intervals long enough for Lago to honour monthly invoicing of usage charges.
 *
 * On any shorter interval Lago accepts `bill_charges_monthly` and silently drops it — the
 * request succeeds, no error is raised, and the setting has no effect. Hiding the field is
 * therefore worth more than documenting it would be, because the failure is invisible.
 */
export const INTERVALS_BILLABLE_MONTHLY = ['semiannual', 'yearly'];

/** Plan fields that are optional on create and are the whole payload on update. */
const optionalFields: INodeProperties['options'] = [
	{
		displayName: 'Description',
		name: 'description',
		type: 'string',
		default: '',
	},
	{
		displayName: 'Invoice Display Name',
		name: 'invoice_display_name',
		type: 'string',
		default: '',
		description: 'Name shown on invoices. Defaults to the plan name.',
	},
	{
		displayName: 'Tax Codes',
		name: 'tax_codes',
		type: 'string',
		default: '',
		placeholder: 'e.g. french_standard_vat,us_sales_tax',
		description: 'Comma-separated tax codes to apply to this plan',
	},
	{
		displayName: 'Trial Period (Days)',
		name: 'trial_period',
		type: 'number',
		default: 0,
		typeOptions: { minValue: 0 },
		description: 'Days the base cost is free for. Zero means no trial.',
	},
];

export function planFields(operation: 'create' | 'update'): INodeProperties[] {
	const show = { resource: ['plan'], operation: [operation] };
	const creating = operation === 'create';

	const identity: INodeProperties[] = [
		{
			displayName: 'Code',
			name: 'code',
			type: 'string',
			default: '',
			required: true,
			placeholder: 'e.g. startup',
			description: creating
				? 'Unique code identifying this plan. Subscriptions reference it.'
				: 'Code of the plan to update',
			displayOptions: { show },
		},
	];

	if (!creating) {
		return [
			...identity,
			{
				displayName: 'Update Fields',
				name: 'additionalFields',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: { show },
				options: [
					{
						displayName: 'Amount (Cents)',
						name: 'amount_cents',
						type: 'number',
						default: 0,
						description:
							'Recurring base cost in the currency’s smallest unit. 10000 means 100.00, not 10000.00.',
					},
					{
						displayName: 'Bill Charges Monthly',
						name: 'bill_charges_monthly',
						type: 'boolean',
						default: false,
						description:
							'Whether to invoice usage charges monthly. Only valid on yearly and semiannual plans.',
					},
					{
						displayName: 'Currency',
						name: 'amount_currency',
						type: 'string',
						default: '',
						placeholder: 'e.g. USD',
					},
					{
						displayName: 'Interval',
						name: 'interval',
						type: 'options',
						default: 'monthly',
						options: PLAN_INTERVALS,
					},
					{
						displayName: 'Name',
						name: 'name',
						type: 'string',
						default: '',
					},
					{
						displayName: 'Pay in Advance',
						name: 'pay_in_advance',
						type: 'boolean',
						default: false,
						description:
							'Whether the base cost is due at the start of each period rather than the end',
					},
					...(optionalFields as INodeProperties[]),
				],
			},
		];
	}

	return [
		...identity,
		{
			displayName: 'Name',
			name: 'name',
			type: 'string',
			default: '',
			required: true,
			placeholder: 'e.g. Startup',
			displayOptions: { show },
		},
		{
			displayName: 'Interval',
			name: 'interval',
			type: 'options',
			default: 'monthly',
			required: true,
			description: 'How often the subscription is billed',
			options: PLAN_INTERVALS,
			displayOptions: { show },
		},
		{
			displayName: 'Amount (Cents)',
			name: 'amountCents',
			type: 'number',
			default: 0,
			required: true,
			typeOptions: { minValue: 0 },
			// Lago stores this in minor units. Passing a decimal here is the easiest way to be off
			// by a factor of one hundred, so the unit is in the label as well as the description.
			description:
				'Recurring base cost in the currency’s smallest unit. 10000 means 100.00, not 10000.00. Use 0 for a pure pay-as-you-go plan.',
			displayOptions: { show },
		},
		{
			displayName: 'Currency',
			name: 'amountCurrency',
			type: 'string',
			default: 'USD',
			required: true,
			placeholder: 'e.g. USD',
			description: 'Three-letter ISO 4217 currency code',
			displayOptions: { show },
		},
		{
			displayName: 'Pay in Advance',
			name: 'payInAdvance',
			type: 'boolean',
			default: false,
			description:
				'Whether the base cost is due at the start of each billing period rather than the end',
			displayOptions: { show },
		},
		{
			displayName: 'Bill Charges Monthly',
			name: 'billChargesMonthly',
			type: 'boolean',
			default: false,
			description:
				'Whether to invoice usage-based charges monthly even though the plan bills less often',
			// Silently ignored on shorter intervals, so it is shown only where it takes effect.
			displayOptions: { show: { ...show, interval: INTERVALS_BILLABLE_MONTHLY } },
		},
		{
			displayName: 'Additional Fields',
			name: 'additionalFields',
			type: 'collection',
			placeholder: 'Add Field',
			default: {},
			displayOptions: { show },
			options: optionalFields,
		},
	];
}

/** Splits the comma-separated tax code field into the array Lago expects. */
export function toTaxCodes(value: unknown): string[] | undefined {
	if (typeof value !== 'string') return undefined;
	const codes = value
		.split(',')
		.map((code) => code.trim())
		.filter(Boolean);
	return codes.length ? codes : undefined;
}
