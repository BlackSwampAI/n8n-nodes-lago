import type { INodeProperties, JsonObject } from 'n8n-workflow';
import { lagoApiRequest } from '../../shared/transport';
import type { OperationHandler } from '../../shared/types';

const show = { resource: ['billableMetric'], operation: ['delete'] };

export const removeFields: INodeProperties[] = [
	{
		displayName: 'Code',
		name: 'code',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. ai_tokens',
		displayOptions: { show },
	},
];

export const remove: OperationHandler = async function (index) {
	const code = this.getNodeParameter('code', index) as string;

	const response = await lagoApiRequest.call(
		this,
		'DELETE',
		`/billable_metrics/${encodeURIComponent(code)}`,
		{ resource: 'Billable Metric', resourceId: code },
	);

	return response.billable_metric as JsonObject;
};
