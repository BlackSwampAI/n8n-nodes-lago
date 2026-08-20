import {
	NodeOperationError,
	type IDataObject,
	type INodeProperties,
	type JsonObject,
} from 'n8n-workflow';
import { lagoApiRequest } from '../../shared/transport';
import type { OperationHandler } from '../../shared/types';

const show = { resource: ['billableMetric'], operation: ['evaluateExpression'] };

export const evaluateExpressionFields: INodeProperties[] = [
	{
		displayName: 'Expression',
		name: 'expression',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. round(event.properties.units * 2)',
		description:
			'Expression to evaluate. Address event properties as event.properties.&lt;key&gt; and the event time as event.timestamp — a bare property name is rejected. Supports ceil, floor, round and concat, plus the usual arithmetic operators.',
		displayOptions: { show },
	},
	{
		displayName: 'Event Code',
		name: 'eventCode',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. ai_tokens',
		description: 'Billable metric code the sample event targets',
		displayOptions: { show },
	},
	{
		displayName: 'Event Properties',
		name: 'eventProperties',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		placeholder: 'Add Property',
		default: {},
		required: true,
		description: 'Sample event properties the expression is evaluated against',
		displayOptions: { show },
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
						placeholder: 'e.g. units',
					},
					{
						displayName: 'Value',
						name: 'value',
						type: 'string',
						default: '',
						placeholder: 'e.g. 10',
					},
				],
			},
		],
	},
	{
		displayName: 'Timestamp',
		name: 'timestamp',
		type: 'dateTime',
		default: '',
		description: 'Timestamp of the sample event. Defaults to now when left empty.',
		displayOptions: { show },
	},
];

/**
 * Lago's expression language is numeric, but n8n's key/value input is string-typed.
 *
 * Sending "10" where the expression expects a number makes arithmetic behave as string
 * concatenation, so numeric-looking values are converted. Anything that is not a clean number is
 * left as a string, which is what `concat` operates on.
 */
function coerce(value: unknown): string | number {
	const text = String(value ?? '');
	if (text.trim() === '') return text;
	const numeric = Number(text);
	return Number.isFinite(numeric) ? numeric : text;
}

export const evaluateExpression: OperationHandler = async function (index) {
	const expression = this.getNodeParameter('expression', index) as string;
	const code = this.getNodeParameter('eventCode', index) as string;
	const entries = this.getNodeParameter('eventProperties.property', index, []) as IDataObject[];
	const timestamp = this.getNodeParameter('timestamp', index, '') as string;

	// Lago requires the sample event's properties, and an expression evaluated against nothing
	// would report a misleading result rather than an error.
	if (entries.length === 0) {
		throw new NodeOperationError(
			this.getNode(),
			'Add at least one event property to evaluate the expression against',
			{ itemIndex: index },
		);
	}

	const properties: IDataObject = {};
	for (const entry of entries) {
		const key = String(entry.key ?? '').trim();
		if (key) properties[key] = coerce(entry.value);
	}

	const event: IDataObject = { code, properties };
	if (timestamp) event.timestamp = Math.floor(new Date(timestamp).getTime() / 1000);

	const response = await lagoApiRequest.call(
		this,
		'POST',
		'/billable_metrics/evaluate_expression',
		{
			body: { expression, event },
			resource: 'Billable Metric',
			resourceId: code,
		},
	);

	// Unwrapped to { value } so the result is directly usable in a downstream expression rather
	// than nested two levels deep.
	return (response.expression_result ?? {}) as JsonObject;
};
