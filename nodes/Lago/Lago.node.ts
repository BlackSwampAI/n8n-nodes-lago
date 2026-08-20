import { NodeConnectionTypes, type INodeType, type INodeTypeDescription } from 'n8n-workflow';

export class Lago implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Lago',
		name: 'lago',
		icon: { light: 'file:../../icons/lago.svg', dark: 'file:../../icons/lago.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Automate subscription billing, usage metering and invoicing with Lago',
		defaults: {
			name: 'Lago',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'lagoApi',
				required: true,
			},
		],
		requestDefaults: {
			baseURL:
				'={{ $credentials.baseUrl.replace(/\\/+$/, "").replace(/\\/api\\/v1$/, "") + "/api/v1" }}',
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
			},
		},
		// Resources and operations are added per milestone, starting with Customer.
		properties: [],
	};
}
