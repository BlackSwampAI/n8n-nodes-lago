import type { IDataObject, INodeProperties, JsonObject } from 'n8n-workflow';
import { lagoApiRequest } from '../../shared/transport';
import type { OperationHandler } from '../../shared/types';
import { chargeFields } from './fields';
import { readChargeProperties } from './create';

export const updateFields: INodeProperties[] = chargeFields('update');

export const update: OperationHandler = async function (index) {
	const planCode = this.getNodeParameter('planCode', index) as string;
	const chargeCode = this.getNodeParameter('chargeCode', index) as string;
	const chargeModel = this.getNodeParameter('chargeModel', index) as string;
	const additionalFields = this.getNodeParameter('additionalFields', index, {}) as IDataObject;

	const get = (name: string, fallback?: unknown) => this.getNodeParameter(name, index, fallback);
	const properties = readChargeProperties.call({}, get, chargeModel);

	const charge: IDataObject = { charge_model: chargeModel, ...additionalFields };
	if (Object.keys(properties).length > 0) charge.properties = properties;

	const response = await lagoApiRequest.call(
		this,
		'PUT',
		`/plans/${encodeURIComponent(planCode)}/charges/${encodeURIComponent(chargeCode)}`,
		{ body: { charge }, resource: 'Plan Charge', resourceId: chargeCode },
	);

	return response.charge as JsonObject;
};
