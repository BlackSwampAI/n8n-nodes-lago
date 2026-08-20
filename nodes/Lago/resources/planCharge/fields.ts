import type { IDataObject, INodeProperties } from 'n8n-workflow';

export const CHARGE_MODELS = [
	{ name: 'Standard', value: 'standard', description: 'A flat price for every unit' },
	{ name: 'Package', value: 'package', description: 'A price per bundle of units' },
	{
		name: 'Percentage',
		value: 'percentage',
		description: 'A percentage of the transaction amount, plus an optional fixed fee',
	},
	{
		name: 'Graduated',
		value: 'graduated',
		description: 'Tiered pricing where each tier is charged at its own rate',
	},
	{
		name: 'Volume',
		value: 'volume',
		description: 'Tiered pricing where every unit is charged at the tier reached',
	},
	{
		name: 'Graduated Percentage',
		value: 'graduated_percentage',
		// Rejected on the free edition with charge_model:
		// graduated_percentage_requires_premium_license. It is the only charge model that is
		// gated, so saying so here saves a failed run.
		description: 'Tiered pricing expressed as percentages. Requires a Lago premium licence.',
	},
	{
		name: 'Dynamic',
		value: 'dynamic',
		description: 'The amount comes from the event itself rather than the charge',
	},
];

/** Charge models priced with tier ranges rather than a single amount. */
export const RANGE_MODELS = ['graduated', 'volume', 'graduated_percentage'];

/**
 * Money fields are strings, not numbers.
 *
 * Lago rejects a JSON number outright — `{"amount": 2.5}` answers 422 `properties:
 * invalid_amount` — and a decimal typed as text survives exactly as written, which a float
 * cannot promise for money.
 */
const amountField = (
	name: string,
	displayName: string,
	description: string,
	placeholder = 'e.g. 0.01',
): INodeProperties => ({
	displayName,
	name,
	type: 'string',
	default: '',
	placeholder,
	description: ', Given as a decimal, because Lago rejects a plain number here',
});

/** The tier rows shared by the graduated and volume models. */
function rangeValues(kind: 'amount' | 'percentage'): INodeProperties[] {
	return [
		{
			displayName: 'From Value',
			name: 'from_value',
			type: 'number',
			default: 0,
			description: 'Lower bound of the tier. Must be 0, or the previous tier’s To Value plus one.',
		},
		{
			displayName: 'To Value',
			name: 'to_value',
			type: 'number',
			default: 0,
			description: 'Upper bound of the tier. Leave at 0 on the last tier to make it unbounded.',
		},
		...(kind === 'amount'
			? [
					amountField('per_unit_amount', 'Per Unit Amount', 'Price for each unit in this tier.'),
					amountField('flat_amount', 'Flat Amount', 'Fixed price for the whole tier.', 'e.g. 10'),
				]
			: [
					amountField('rate', 'Rate', 'Percentage applied within this tier.', 'e.g. 1.5'),
					amountField('flat_amount', 'Flat Amount', 'Fixed price for the whole tier.', 'e.g. 10'),
				]),
	];
}

function rangeCollection(
	name: string,
	displayName: string,
	model: string,
	kind: 'amount' | 'percentage',
	show: IDataObject,
): INodeProperties {
	return {
		displayName,
		name,
		type: 'fixedCollection',
		typeOptions: { multipleValues: true, sortable: true },
		placeholder: 'Add Tier',
		default: {},
		description: 'Tiers from lowest to highest. Each tier begins where the previous one ended.',
		displayOptions: { show: { ...show, chargeModel: [model] } },
		options: [{ displayName: 'Tier', name: 'range', values: rangeValues(kind) }],
	};
}

/**
 * Charge fields for one operation.
 *
 * Every charge model is offered as real fields rather than a JSON blob, and only the properties
 * belonging to the selected model are shown — the models have almost nothing in common, so a
 * single flat form would be mostly irrelevant at any given moment.
 */
export function chargeFields(operation: 'create' | 'update'): INodeProperties[] {
	const show = { resource: ['planCharge'], operation: [operation] };
	const creating = operation === 'create';

	return [
		{
			displayName: 'Plan Code',
			name: 'planCode',
			type: 'string',
			default: '',
			required: true,
			placeholder: 'e.g. starter',
			description: 'Code of the plan this charge belongs to',
			displayOptions: { show },
		},
		{
			displayName: 'Charge Code',
			name: 'chargeCode',
			type: 'string',
			default: '',
			required: true,
			placeholder: 'e.g. ai_tokens_charge',
			// Lago rejects a charge with no code, and every later read, update or delete addresses
			// the charge by it.
			description:
				'Unique code for this charge within the plan. Required by Lago, and how the charge is addressed afterwards.',
			displayOptions: { show },
		},
		...(creating
			? [
					{
						displayName: 'Billable Metric Name or ID',
						name: 'billableMetricId',
						type: 'options',
						typeOptions: { loadOptionsMethod: 'getBillableMetricIds' },
						default: '',
						required: true,
						// The charge references the metric by Lago's internal UUID, which no workflow
						// author has to hand. The dropdown shows names and sends the identifier.
						description:
							'Metric this charge prices. Lago references it by internal ID rather than by code, so it is chosen from the list. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
						displayOptions: { show },
					} satisfies INodeProperties,
				]
			: []),
		{
			displayName: 'Charge Model',
			name: 'chargeModel',
			type: 'options',
			default: 'standard',
			required: true,
			description: 'How Lago turns aggregated units into an amount',
			options: CHARGE_MODELS,
			displayOptions: { show },
		},

		// Standard
		{
			...amountField('amount', 'Amount', 'Price per unit.'),
			required: true,
			displayOptions: { show: { ...show, chargeModel: ['standard'] } },
		},

		// Package
		{
			...amountField('packageAmount', 'Amount', 'Price per package.', 'e.g. 10'),
			required: true,
			displayOptions: { show: { ...show, chargeModel: ['package'] } },
		},
		{
			displayName: 'Package Size',
			name: 'packageSize',
			type: 'number',
			default: 100,
			required: true,
			description: 'Units bundled into one package',
			displayOptions: { show: { ...show, chargeModel: ['package'] } },
		},
		{
			displayName: 'Free Units',
			name: 'freeUnits',
			type: 'number',
			default: 0,
			description: 'Units given away each billing period before packages are charged',
			displayOptions: { show: { ...show, chargeModel: ['package'] } },
		},

		// Percentage
		{
			...amountField('rate', 'Rate', 'Percentage applied to each transaction.', 'e.g. 1.5'),
			required: true,
			displayOptions: { show: { ...show, chargeModel: ['percentage'] } },
		},
		{
			...amountField('fixedAmount', 'Fixed Amount', 'Fee added to each transaction.', 'e.g. 0.30'),
			displayOptions: { show: { ...show, chargeModel: ['percentage'] } },
		},
		{
			displayName: 'Percentage Options',
			name: 'percentageOptions',
			type: 'collection',
			placeholder: 'Add Option',
			default: {},
			displayOptions: { show: { ...show, chargeModel: ['percentage'] } },
			options: [
				{
					displayName: 'Free Transactions Per Period',
					name: 'free_units_per_events',
					type: 'number',
					default: 0,
					description: 'Transactions exempt from the rate and fixed fee each period',
				},
				{
					displayName: 'Free Amount Per Period',
					name: 'free_units_per_total_aggregation',
					type: 'string',
					default: '',
					placeholder: 'e.g. 100',
					description: 'Transaction value exempt from the rate each period, as a decimal',
				},
				{
					displayName: 'Per Transaction Maximum',
					name: 'per_transaction_max_amount',
					type: 'string',
					default: '',
					placeholder: 'e.g. 50',
					description: 'Cap on the fee for a single transaction, as a decimal',
				},
				{
					displayName: 'Per Transaction Minimum',
					name: 'per_transaction_min_amount',
					type: 'string',
					default: '',
					placeholder: 'e.g. 1',
					description: 'Floor for the fee on a single transaction, as a decimal',
				},
			],
		},

		// Tiered models
		rangeCollection('graduatedRanges', 'Tiers', 'graduated', 'amount', show),
		rangeCollection('volumeRanges', 'Tiers', 'volume', 'amount', show),
		rangeCollection(
			'graduatedPercentageRanges',
			'Tiers',
			'graduated_percentage',
			'percentage',
			show,
		),

		{
			displayName: 'Additional Fields',
			name: 'additionalFields',
			type: 'collection',
			placeholder: 'Add Field',
			default: {},
			displayOptions: { show },
			options: [
				{
					displayName: 'Invoice Display Name',
					name: 'invoice_display_name',
					type: 'string',
					default: '',
					description: 'Name shown for this charge on invoices',
				},
				{
					displayName: 'Invoiceable',
					name: 'invoiceable',
					type: 'boolean',
					default: true,
					description: 'Whether the charge appears on an invoice at all',
				},
				{
					displayName: 'Minimum Amount (Cents)',
					name: 'min_amount_cents',
					type: 'number',
					default: 0,
					// Unlike every other money field on a charge, this one is in cents, matching the
					// plan rather than the charge properties.
					description:
						'Spend floor for the charge each period, in the currency’s smallest unit. Note this is in cents, unlike the amounts above.',
				},
				{
					displayName: 'Pay in Advance',
					name: 'pay_in_advance',
					type: 'boolean',
					default: false,
					description: 'Whether the charge is billed as usage arrives rather than at period end',
				},
				{
					displayName: 'Prorated',
					name: 'prorated',
					type: 'boolean',
					default: false,
					description: 'Whether the charge is prorated over a partial billing period',
				},
			],
		},
	];
}

/** Turns the tier rows into the range objects Lago expects, dropping empty amounts. */
export function buildRanges(rows: IDataObject[]): IDataObject[] {
	return rows.map((row) => {
		const range: IDataObject = {
			from_value: Number(row.from_value ?? 0),
			to_value: Number(row.to_value ?? 0) > 0 ? Number(row.to_value) : null,
		};
		for (const key of ['per_unit_amount', 'flat_amount', 'rate']) {
			const value = row[key];
			if (typeof value === 'string' && value.trim() !== '') range[key] = value.trim();
		}
		return range;
	});
}
