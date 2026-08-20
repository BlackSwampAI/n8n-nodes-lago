import type { IDataObject, INodeProperties, JsonObject } from 'n8n-workflow';
import { lagoApiRequest } from '../../shared/transport';
import type { OperationHandler } from '../../shared/types';
import { buildProperties, eventValueFields } from './fields';

const show = { resource: ['event'], operation: ['sendBatch'] };

export const sendBatchFields: INodeProperties[] = [
	{
		displayName: 'Events',
		name: 'events',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		placeholder: 'Add Event',
		default: {},
		// Structured rows rather than a JSON array: the point of the node is that a workflow
		// author does not have to hand-write Lago's payload. Sending one event per input item is
		// what the Send operation is for.
		description:
			'Events to send in a single request. To send one event per input item instead, use the Send operation.',
		displayOptions: { show },
		options: [
			{
				displayName: 'Event',
				name: 'event',
				values: eventValueFields(),
			},
		],
	},
];

export const sendBatch: OperationHandler = async function (index) {
	const rows = this.getNodeParameter('events.event', index, []) as IDataObject[];

	const events = rows.map((row, position) => {
		const event: IDataObject = {
			external_subscription_id: row.externalSubscriptionId,
			code: row.code,
			transaction_id:
				(row.transactionId as string) || `${this.getExecutionId()}-${index}-${position}`,
		};

		const entries = ((row.properties as IDataObject)?.property ?? []) as IDataObject[];
		const properties = buildProperties(entries);
		if (Object.keys(properties).length > 0) event.properties = properties;

		if (row.timestamp) {
			event.timestamp = Math.floor(new Date(row.timestamp as string).getTime() / 1000);
		}

		return event;
	});

	const response = await lagoApiRequest.call(this, 'POST', '/events/batch', {
		body: { events },
		resource: 'Event',
	});

	// Returned as one item per event rather than one wrapping object, so downstream nodes can
	// act per event the way they would after the Send operation.
	return (response.events ?? []) as JsonObject[];
};
