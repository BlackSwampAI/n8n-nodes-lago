import {
	NodeConnectionTypes,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeType,
	type INodeTypeDescription,
} from 'n8n-workflow';
import { billableMetricDescription } from './resources/billableMetric';
import { customerDescription } from './resources/customer';
import { eventDescription } from './resources/event';
import { planDescription } from './resources/plan';
import { subscriptionDescription } from './resources/subscription';
import { getBillableMetricCodes } from './shared/loadOptions';
import { routeOperations } from './shared/router';

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
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				default: 'customer',
				options: [
					{ name: 'Billable Metric', value: 'billableMetric' },
					{ name: 'Customer', value: 'customer' },
					{ name: 'Event', value: 'event' },
					{ name: 'Plan', value: 'plan' },
					{ name: 'Subscription', value: 'subscription' },
				],
			},
			...billableMetricDescription,
			...customerDescription,
			...eventDescription,
			...planDescription,
			...subscriptionDescription,
		],
	};

	methods = {
		loadOptions: {
			getBillableMetricCodes,
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		return routeOperations.call(this);
	}
}
