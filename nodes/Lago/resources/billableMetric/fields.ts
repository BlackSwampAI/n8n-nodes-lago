import type { IDataObject, INodeProperties } from 'n8n-workflow';

export const AGGREGATION_TYPES = [
	{ name: 'Count', value: 'count_agg', description: 'Counts the number of events received' },
	{ name: 'Sum', value: 'sum_agg', description: 'Adds up the value of a property on each event' },
	{ name: 'Max', value: 'max_agg', description: 'Takes the highest value seen in the period' },
	{
		name: 'Unique Count',
		value: 'unique_count_agg',
		description: 'Counts distinct values of a property',
	},
	{
		name: 'Weighted Sum',
		value: 'weighted_sum_agg',
		description: 'Sums values weighted by how long each applied',
	},
	{ name: 'Latest', value: 'latest_agg', description: 'Takes the last value seen in the period' },
];

/** Every aggregation except `count_agg` needs a property to aggregate over. */
export const AGGREGATIONS_NEEDING_FIELD = AGGREGATION_TYPES.map((type) => type.value).filter(
	(value) => value !== 'count_agg',
);

/**
 * The writable fields of a billable metric, shared by Create and Update.
 *
 * Create requires code, name and aggregation type; Update takes the same shape with everything
 * optional, so the two differ only in which fields are marked required.
 */
export function billableMetricFields(operation: 'create' | 'update'): INodeProperties[] {
	const show = { resource: ['billableMetric'], operation: [operation] };
	const required = operation === 'create';

	return [
		...(required
			? [
					{
						displayName: 'Code',
						name: 'code',
						type: 'string',
						default: '',
						required: true,
						placeholder: 'e.g. ai_tokens',
						description:
							'Unique code identifying this metric. Usage events reference it, so it cannot be changed once events have been sent.',
						displayOptions: { show },
					} satisfies INodeProperties,
					{
						displayName: 'Name',
						name: 'name',
						type: 'string',
						default: '',
						required: true,
						placeholder: 'e.g. AI Tokens',
						displayOptions: { show },
					} satisfies INodeProperties,
					{
						displayName: 'Aggregation Type',
						name: 'aggregationType',
						type: 'options',
						default: 'count_agg',
						required: true,
						description: 'How Lago turns individual events into billable units',
						options: AGGREGATION_TYPES,
						displayOptions: { show },
					} satisfies INodeProperties,
					// Lago rejects every aggregation except count_agg without a field name, so it is
					// promoted out of Additional Fields and shown exactly when it is needed rather
					// than left as an optional field that silently fails.
					{
						displayName: 'Field Name',
						name: 'fieldName',
						type: 'string',
						default: '',
						required: true,
						placeholder: 'e.g. tokens',
						description:
							'Event property to aggregate over. Required for every aggregation except Count.',
						displayOptions: {
							show: { ...show, aggregationType: AGGREGATIONS_NEEDING_FIELD },
						},
					} satisfies INodeProperties,
				]
			: [
					{
						displayName: 'Code',
						name: 'code',
						type: 'string',
						default: '',
						required: true,
						placeholder: 'e.g. ai_tokens',
						description: 'Code of the billable metric to update',
						displayOptions: { show },
					} satisfies INodeProperties,
				]),
		{
			displayName: 'Additional Fields',
			name: 'additionalFields',
			type: 'collection',
			placeholder: 'Add Field',
			default: {},
			displayOptions: { show },
			options: [
				...(required
					? []
					: [
							{
								displayName: 'Aggregation Type',
								name: 'aggregation_type',
								type: 'options' as const,
								default: 'count_agg',
								options: AGGREGATION_TYPES,
							},
							{
								displayName: 'Field Name',
								name: 'field_name',
								type: 'string' as const,
								default: '',
								description: 'Event property to aggregate over',
							},
							{
								displayName: 'Name',
								name: 'name',
								type: 'string' as const,
								default: '',
							},
						]),
				{
					displayName: 'Description',
					name: 'description',
					type: 'string',
					default: '',
				},
				{
					displayName: 'Expression',
					name: 'expression',
					type: 'string',
					default: '',
					placeholder: 'e.g. round(event.properties.units * 2)',
					description:
						'Computes event units from event properties before aggregation. Properties are addressed as event.properties.&lt;key&gt;, and the event time as event.timestamp. Use the Evaluate Expression operation to check one against a sample event before saving it.',
				},
				{
					displayName: 'Recurring',
					name: 'recurring',
					type: 'boolean',
					default: false,
					description:
						'Whether accumulated units carry into the next billing period instead of resetting to zero',
				},
				{
					displayName: 'Rounding Function',
					name: 'rounding_function',
					type: 'options',
					default: 'round',
					options: [
						{ name: 'Ceil', value: 'ceil' },
						{ name: 'Floor', value: 'floor' },
						{ name: 'Round', value: 'round' },
					],
				},
				{
					displayName: 'Rounding Precision',
					name: 'rounding_precision',
					type: 'number',
					default: 2,
					description: 'Decimal places the rounding function applies to. May be negative.',
				},
				{
					displayName: 'Weighted Interval',
					name: 'weighted_interval',
					type: 'options',
					default: 'seconds',
					description: 'Only used with the Weighted Sum aggregation',
					options: [{ name: 'Seconds', value: 'seconds' }],
				},
			],
		},
		{
			displayName: 'Filters',
			name: 'filters',
			type: 'fixedCollection',
			typeOptions: { multipleValues: true },
			placeholder: 'Add Filter',
			default: {},
			description:
				'Event properties that charges may later price differently. A filter must be declared here before a plan charge can use it.',
			displayOptions: { show },
			options: [
				{
					displayName: 'Filter',
					name: 'filter',
					values: [
						{
							displayName: 'Key',
							name: 'key',
							type: 'string',
							default: '',
							placeholder: 'e.g. model',
						},
						{
							displayName: 'Values',
							name: 'values',
							type: 'string',
							default: '',
							placeholder: 'e.g. gpt-4,gpt-3.5',
							description: 'Comma-separated list of values this property may take',
						},
					],
				},
			],
		},
	];
}

/** Turns the Filters fixedCollection into the `[{ key, values: [] }]` shape Lago expects. */
export function buildFilters(entries: IDataObject[]): IDataObject[] {
	return entries
		.map((entry) => ({
			key: String(entry.key ?? '').trim(),
			values: String(entry.values ?? '')
				.split(',')
				.map((value) => value.trim())
				.filter(Boolean),
		}))
		.filter((entry) => entry.key && entry.values.length > 0);
}
