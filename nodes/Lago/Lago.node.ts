import {
	NodeConnectionTypes,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeType,
	type INodeTypeDescription,
} from 'n8n-workflow';
import { billableMetricDescription } from './resources/billableMetric';
import { couponDescription } from './resources/coupon';
import { creditNoteDescription } from './resources/creditNote';
import { customerDescription } from './resources/customer';
import { eventDescription } from './resources/event';
import { invoiceDescription } from './resources/invoice';
import { planDescription } from './resources/plan';
import { planChargeDescription } from './resources/planCharge';
import { subscriptionDescription } from './resources/subscription';
import { walletDescription } from './resources/wallet';
import { walletTransactionDescription } from './resources/walletTransaction';
import { webhookEndpointDescription } from './resources/webhookEndpoint';
import { getBillableMetricCodes, getBillableMetricIds } from './shared/loadOptions';
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
					{ name: 'Coupon', value: 'coupon' },
					{ name: 'Credit Note', value: 'creditNote' },
					{ name: 'Customer', value: 'customer' },
					{ name: 'Event', value: 'event' },
					{ name: 'Invoice', value: 'invoice' },
					{ name: 'Plan', value: 'plan' },
					{ name: 'Plan Charge', value: 'planCharge' },
					{ name: 'Subscription', value: 'subscription' },
					{ name: 'Wallet', value: 'wallet' },
					{ name: 'Wallet Transaction', value: 'walletTransaction' },
					{ name: 'Webhook Endpoint', value: 'webhookEndpoint' },
				],
			},
			...billableMetricDescription,
			...couponDescription,
			...creditNoteDescription,
			...customerDescription,
			...eventDescription,
			...invoiceDescription,
			...planDescription,
			...planChargeDescription,
			...subscriptionDescription,
			...walletDescription,
			...walletTransactionDescription,
			...webhookEndpointDescription,
		],
	};

	methods = {
		loadOptions: {
			getBillableMetricCodes,
			getBillableMetricIds,
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		return routeOperations.call(this);
	}
}
