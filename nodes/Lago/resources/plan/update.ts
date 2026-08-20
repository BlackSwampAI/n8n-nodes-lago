import type { IDataObject, INodeProperties, JsonObject } from 'n8n-workflow';
import { lagoApiRequest } from '../../shared/transport';
import type { OperationHandler } from '../../shared/types';
import { planFields, toTaxCodes } from './fields';

export const updateFields: INodeProperties[] = planFields('update');

export const update: OperationHandler = async function (index) {
	const code = this.getNodeParameter('code', index) as string;
	const additionalFields = this.getNodeParameter('additionalFields', index, {}) as IDataObject;

	const plan: IDataObject = { ...additionalFields };

	const taxCodes = toTaxCodes(additionalFields.tax_codes);
	if (taxCodes) plan.tax_codes = taxCodes;
	else delete plan.tax_codes;

	const response = await lagoApiRequest.call(this, 'PUT', `/plans/${encodeURIComponent(code)}`, {
		body: { plan },
		resource: 'Plan',
		resourceId: code,
	});

	return response.plan as JsonObject;
};
