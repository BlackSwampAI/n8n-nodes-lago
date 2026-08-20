import type { IDataObject, INodeProperties, JsonObject } from 'n8n-workflow';
import { lagoApiRequest } from '../../shared/transport';
import type { OperationHandler } from '../../shared/types';
import { buildProperties, scopedEventFields } from './fields';

// Estimation describes an event that has not happened, so a transaction ID would be meaningless
// and a timestamp is not used.
export const estimateFeesFields: INodeProperties[] = scopedEventFields('estimateFees').filter(
	(field) => field.name !== 'transactionId' && field.name !== 'timestamp',
);

export const estimateFees: OperationHandler = async function (index) {
	const entries = this.getNodeParameter('properties.property', index, []) as IDataObject[];

	const event: IDataObject = {
		external_subscription_id: this.getNodeParameter('externalSubscriptionId', index) as string,
		code: this.getNodeParameter('code', index) as string,
	};

	const properties = buildProperties(entries);
	if (Object.keys(properties).length > 0) event.properties = properties;

	const response = await lagoApiRequest.call(this, 'POST', '/events/estimate_fees', {
		body: { event },
		resource: 'Event',
	});

	return (response.fees ?? []) as JsonObject[];
};
