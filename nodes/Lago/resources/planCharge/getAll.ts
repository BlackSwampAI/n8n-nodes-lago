import type { INodeProperties, JsonObject } from 'n8n-workflow';
import { lagoApiRequestAllItems } from '../../shared/transport';
import { listPaginationFields } from '../../shared/descriptions';
import type { OperationHandler } from '../../shared/types';

const show = { resource: ['planCharge'], operation: ['getAll'] };

export const getAllFields: INodeProperties[] = [
	{
		displayName: 'Plan Code',
		name: 'planCode',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. starter',
		description: 'Plan whose charges are listed',
		displayOptions: { show },
	},
	...listPaginationFields(show),
];

export const getAll: OperationHandler = async function (index) {
	const planCode = this.getNodeParameter('planCode', index) as string;
	const returnAll = this.getNodeParameter('returnAll', index, false) as boolean;
	const limit = returnAll ? 0 : (this.getNodeParameter('limit', index, 50) as number);

	return lagoApiRequestAllItems<JsonObject>(
		this,
		`/plans/${encodeURIComponent(planCode)}/charges`,
		'charges',
		{ returnAll, limit, resource: 'Plan Charge' },
	);
};
