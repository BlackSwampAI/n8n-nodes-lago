import type { IDataObject, INodeProperties } from 'n8n-workflow';

/**
 * The fields describing a single usage event.
 *
 * Shared by Send, Send Batch and Estimate Fees so the three cannot drift, and so a workflow
 * author sees the same shape wherever an event is described.
 */
export function eventValueFields(
	options: { requireSubscription?: boolean } = {},
): INodeProperties[] {
	return [
		{
			displayName: 'Subscription External ID',
			name: 'externalSubscriptionId',
			type: 'string',
			default: '',
			required: options.requireSubscription ?? true,
			placeholder: 'e.g. acme-corp-starter',
			description: 'Subscription the usage belongs to. Lago bills the customer behind it.',
		},
		{
			displayName: 'Billable Metric Name or ID',
			name: 'code',
			type: 'options',
			typeOptions: { loadOptionsMethod: 'getBillableMetricCodes' },
			default: '',
			required: true,
			// Lago ignores an event whose code matches no active billable metric — it answers 200
			// and silently drops it. A dropdown of real codes is the difference between a typo
			// being obvious and a month of usage quietly not being billed.
			description:
				'Metric this usage counts towards. Chosen from the metrics defined in Lago, because an event whose code matches no active metric is accepted and then silently ignored. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		},
		{
			displayName: 'Transaction ID',
			name: 'transactionId',
			type: 'string',
			default: '',
			placeholder: 'e.g. invoice-4821-line-3',
			description:
				'Idempotency key for this event. Leave empty to derive one from the execution, which makes an n8n retry safe by default.',
		},
		{
			displayName: 'Timestamp',
			name: 'timestamp',
			type: 'dateTime',
			default: '',
			description: 'When the usage occurred. Defaults to the time Lago receives the event.',
		},
		{
			displayName: 'Properties',
			name: 'properties',
			type: 'fixedCollection',
			typeOptions: { multipleValues: true },
			placeholder: 'Add Property',
			default: {},
			description:
				'Values the billable metric aggregates over, such as the field named by a Sum metric',
			options: [
				{
					displayName: 'Property',
					name: 'property',
					values: [
						{
							displayName: 'Key',
							name: 'key',
							type: 'string',
							default: '',
							placeholder: 'e.g. tokens',
						},
						{
							displayName: 'Value',
							name: 'value',
							type: 'string',
							default: '',
							placeholder: 'e.g. 143217',
						},
					],
				},
			],
		},
	];
}

/** Applies `show` to a set of event fields, so one builder serves several operations. */
export function scopedEventFields(
	operation: string,
	options: { requireSubscription?: boolean } = {},
): INodeProperties[] {
	const show = { resource: ['event'], operation: [operation] };
	return eventValueFields(options).map((field) => ({ ...field, displayOptions: { show } }));
}

/**
 * Converts n8n's string-typed key/value rows into event properties.
 *
 * Numeric-looking values are converted, because Lago aggregates them arithmetically: a Sum
 * metric handed the string "10" would not add up the way the workflow author expects. Anything
 * that is not a clean number is left alone, since metrics also filter on string properties.
 */
export function buildProperties(entries: IDataObject[]): IDataObject {
	const properties: IDataObject = {};
	for (const entry of entries) {
		const key = String(entry.key ?? '').trim();
		if (!key) continue;
		const text = String(entry.value ?? '');
		const numeric = Number(text);
		properties[key] = text.trim() !== '' && Number.isFinite(numeric) ? numeric : text;
	}
	return properties;
}
