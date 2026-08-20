import type { INodeProperties, JsonObject } from 'n8n-workflow';
import { lagoApiRequest } from '../../shared/transport';
import type { OperationHandler } from '../../shared/types';

const show = { resource: ['planCharge'], operation: ['get'] };

export const getFields: INodeProperties[] = [
	{
		displayName: 'Plan Code',
		name: 'planCode',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. starter',
		displayOptions: { show },
	},
	{
		displayName: 'Charge Code',
		name: 'chargeCode',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. ai_tokens_charge',
		displayOptions: { show },
	},
];

export const get: OperationHandler = async function (index) {
	const planCode = this.getNodeParameter('planCode', index) as string;
	const chargeCode = this.getNodeParameter('chargeCode', index) as string;

	const response = await lagoApiRequest.call(
		this,
		'GET',
		`/plans/${encodeURIComponent(planCode)}/charges/${encodeURIComponent(chargeCode)}`,
		{ resource: 'Plan Charge', resourceId: chargeCode },
	);

	return response.charge as JsonObject;
};
