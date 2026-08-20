import type { IDataObject, INodeProperties } from 'n8n-workflow';

export const COUPON_TYPES = [
	{ name: 'Fixed Amount', value: 'fixed_amount', description: 'Takes a fixed sum off the invoice' },
	{ name: 'Percentage', value: 'percentage', description: 'Takes a percentage off the invoice' },
];

export const COUPON_FREQUENCIES = [
	{ name: 'Once', value: 'once', description: 'Applies to a single invoice' },
	{ name: 'Recurring', value: 'recurring', description: 'Applies for a set number of periods' },
	{ name: 'Forever', value: 'forever', description: 'Applies to every invoice' },
];

export const COUPON_EXPIRATIONS = [
	{ name: 'No Expiration', value: 'no_expiration' },
	{ name: 'Time Limit', value: 'time_limit' },
];

/**
 * Coupon fields for Create or Update.
 *
 * A coupon's shape depends on three independent choices — its type, its frequency and its
 * expiration — and each unlocks a different field. Showing all of them at once would offer
 * combinations Lago rejects, so each is bound to the choice that makes it meaningful.
 */
export function couponFields(operation: 'create' | 'update'): INodeProperties[] {
	const show = { resource: ['coupon'], operation: [operation] };
	const creating = operation === 'create';
	const required = creating;

	return [
		{
			displayName: 'Code',
			name: 'code',
			type: 'string',
			default: '',
			required: true,
			placeholder: 'e.g. launch10',
			description: creating
				? 'Unique code for the coupon. Customers are given this when it is applied.'
				: 'Code of the coupon to update',
			displayOptions: { show },
		},
		...(creating
			? [
					{
						displayName: 'Name',
						name: 'name',
						type: 'string' as const,
						default: '',
						required: true,
						placeholder: 'e.g. Launch Discount',
						displayOptions: { show },
					},
				]
			: []),
		{
			displayName: 'Coupon Type',
			name: 'couponType',
			type: 'options',
			default: 'fixed_amount',
			required,
			options: COUPON_TYPES,
			displayOptions: { show },
		},
		{
			displayName: 'Amount (Cents)',
			name: 'amountCents',
			type: 'number',
			default: 0,
			required,
			description: 'Discount in the currency’s smallest unit. 1000 means 10.00.',
			displayOptions: { show: { ...show, couponType: ['fixed_amount'] } },
		},
		{
			displayName: 'Currency',
			name: 'amountCurrency',
			type: 'string',
			default: 'USD',
			required,
			placeholder: 'e.g. USD',
			displayOptions: { show: { ...show, couponType: ['fixed_amount'] } },
		},
		{
			displayName: 'Percentage Rate',
			name: 'percentageRate',
			type: 'string',
			default: '',
			required,
			placeholder: 'e.g. 10.0',
			description: 'Percentage off, as a decimal. Given as text so the value is sent exactly.',
			displayOptions: { show: { ...show, couponType: ['percentage'] } },
		},
		{
			displayName: 'Frequency',
			name: 'frequency',
			type: 'options',
			default: 'once',
			required,
			description: 'How many invoices the coupon applies to',
			options: COUPON_FREQUENCIES,
			displayOptions: { show },
		},
		{
			displayName: 'Frequency Duration',
			name: 'frequencyDuration',
			type: 'number',
			default: 3,
			required,
			description: 'Number of billing periods the coupon applies for',
			displayOptions: { show: { ...show, frequency: ['recurring'] } },
		},
		{
			displayName: 'Expiration',
			name: 'expiration',
			type: 'options',
			default: 'no_expiration',
			required,
			// Lago answers 422 expiration: value_is_invalid when this is omitted, so it is a
			// required choice rather than an optional extra.
			description: 'Whether the coupon can still be applied after a given date',
			options: COUPON_EXPIRATIONS,
			displayOptions: { show },
		},
		{
			displayName: 'Expiration Date',
			name: 'expirationAt',
			type: 'dateTime',
			default: '',
			required,
			description: 'Date after which the coupon can no longer be applied',
			displayOptions: { show: { ...show, expiration: ['time_limit'] } },
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
					displayName: 'Billable Metric Codes',
					name: 'billable_metric_codes',
					type: 'string',
					default: '',
					placeholder: 'e.g. ai_tokens,api_requests',
					description:
						'Comma-separated metric codes the coupon is limited to. Leave empty to apply to everything.',
				},
				{
					displayName: 'Plan Codes',
					name: 'plan_codes',
					type: 'string',
					default: '',
					placeholder: 'e.g. starter,growth',
					description:
						'Comma-separated plan codes the coupon is limited to. Leave empty to apply to everything.',
				},
				{
					displayName: 'Reusable',
					name: 'reusable',
					type: 'boolean',
					default: true,
					description: 'Whether the coupon can be applied to the same customer more than once',
				},
			],
		},
	];
}

/** Splits a comma-separated field into the array Lago expects, or nothing at all. */
export function toCodeList(value: unknown): string[] | undefined {
	if (typeof value !== 'string') return undefined;
	const codes = value
		.split(',')
		.map((code) => code.trim())
		.filter(Boolean);
	return codes.length ? codes : undefined;
}

/** Builds the applies_to block, omitting it entirely when nothing limits the coupon. */
export function buildAppliesTo(additionalFields: IDataObject): IDataObject | undefined {
	const planCodes = toCodeList(additionalFields.plan_codes);
	const metricCodes = toCodeList(additionalFields.billable_metric_codes);
	if (!planCodes && !metricCodes) return undefined;

	const appliesTo: IDataObject = {};
	if (planCodes) appliesTo.plan_codes = planCodes;
	if (metricCodes) appliesTo.billable_metric_codes = metricCodes;
	return appliesTo;
}
