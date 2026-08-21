import type { INodeProperties } from 'n8n-workflow';
import type { OperationHandlers } from '../../shared/types';
import { estimateFees, estimateFeesFields } from './estimateFees';
import { get, getFields } from './get';
import { getAll, getAllFields } from './getAll';
import { send, sendFields } from './send';
import { sendBatch, sendBatchFields } from './sendBatch';

const showOnlyForEvents = { resource: ['event'] };

export const eventDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		default: 'send',
		displayOptions: { show: showOnlyForEvents },
		options: [
			{
				name: 'Estimate Fees',
				value: 'estimateFees',
				action: 'Estimate the fees an event would produce',
				description:
					'Calculate what an event would be charged without recording any usage. Requires a pay-in-advance charge.',
			},
			{
				name: 'Get',
				value: 'get',
				action: 'Get an event',
				description: 'Retrieve a single event by its transaction ID',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many events',
				description: 'Retrieve many events',
			},
			{
				name: 'Send',
				value: 'send',
				action: 'Send a usage event',
				// Ingestion is asynchronous, so a 200 means accepted rather than aggregated.
				description:
					'Record one usage event. Lago accepts the event and aggregates it asynchronously, so usage will not reflect it immediately.',
			},
			{
				name: 'Send Batch',
				value: 'sendBatch',
				action: 'Send many usage events',
				description: 'Record several usage events in a single request',
			},
		],
	},
	{
		// Shown in the panel rather than left to the field tooltip, because this failure is
		// entirely silent: Lago answers 200, stores the event, and never bills it. There is no
		// error to prompt anyone to go looking, and the shortfall only surfaces at invoicing.
		displayName:
			'An event whose billable metric code matches no active metric is <b>accepted and never billed</b> — Lago reports no error. Choose the code from the list rather than typing it, and check it here first if usage does not appear.',
		name: 'unmatchedCodeNotice',
		type: 'notice',
		default: '',
		displayOptions: { show: { resource: ['event'], operation: ['send', 'sendBatch'] } },
	},
	...sendFields,
	...sendBatchFields,
	...getFields,
	...getAllFields,
	...estimateFeesFields,
];

export const eventOperations: OperationHandlers = {
	send,
	sendBatch,
	get,
	getAll,
	estimateFees,
};
