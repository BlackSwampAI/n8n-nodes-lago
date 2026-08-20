import type { IDataObject, INodeProperties, JsonObject } from 'n8n-workflow';
import { lagoApiRequest } from '../../shared/transport';
import type { OperationHandler } from '../../shared/types';
import { buildProperties, scopedEventFields } from './fields';

export const sendFields: INodeProperties[] = scopedEventFields('send');

export const send: OperationHandler = async function (index) {
	const transactionId = this.getNodeParameter('transactionId', index, '') as string;
	const timestamp = this.getNodeParameter('timestamp', index, '') as string;
	const entries = this.getNodeParameter('properties.property', index, []) as IDataObject[];

	const event: IDataObject = {
		external_subscription_id: this.getNodeParameter('externalSubscriptionId', index) as string,
		code: this.getNodeParameter('code', index) as string,
		// Lago deduplicates on transaction_id, so deriving one from the execution makes an n8n
		// retry idempotent without the workflow author having to think about it.
		transaction_id: transactionId || `${this.getExecutionId()}-${index}`,
	};

	const properties = buildProperties(entries);
	if (Object.keys(properties).length > 0) event.properties = properties;
	if (timestamp) event.timestamp = Math.floor(new Date(timestamp).getTime() / 1000);

	const response = await lagoApiRequest.call(this, 'POST', '/events', {
		body: { event },
		resource: 'Event',
		resourceId: String(event.transaction_id),
	});

	return response.event as JsonObject;
};
