import {
	NodeApiError,
	NodeOperationError,
	type IExecuteFunctions,
	type INodeExecutionData,
} from 'n8n-workflow';
import { billableMetricOperations } from '../resources/billableMetric';
import { customerOperations } from '../resources/customer';
import { eventOperations } from '../resources/event';
import { invoiceOperations } from '../resources/invoice';
import { planOperations } from '../resources/plan';
import { planChargeOperations } from '../resources/planCharge';
import { subscriptionOperations } from '../resources/subscription';
import type { OperationHandlers } from './types';

/**
 * Every resource the node can dispatch to.
 *
 * Exported so tests can assert that the UI and the handler map agree without reimplementing the
 * list, which would defeat the point of checking.
 */
export const resources: Record<string, OperationHandlers> = {
	billableMetric: billableMetricOperations,
	customer: customerOperations,
	event: eventOperations,
	invoice: invoiceOperations,
	plan: planOperations,
	planCharge: planChargeOperations,
	subscription: subscriptionOperations,
};

/**
 * Dispatches each input item to the handler for the selected resource and operation.
 *
 * Every item is processed independently so Continue On Fail can report a failure per item
 * rather than losing the whole batch. That matters most for usage and customer syncs, where one
 * malformed row should not discard the rest of the run.
 */
export async function routeOperations(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
	const items = this.getInputData();
	const resource = this.getNodeParameter('resource', 0) as string;
	const operation = this.getNodeParameter('operation', 0) as string;

	const handler = resources[resource]?.[operation];
	if (!handler) {
		throw new NodeOperationError(
			this.getNode(),
			`The operation "${operation}" is not supported for the resource "${resource}"`,
		);
	}

	const returnData: INodeExecutionData[] = [];

	for (let index = 0; index < items.length; index++) {
		try {
			const result = await handler.call(this, index);
			const records = Array.isArray(result) ? result : [result];
			returnData.push(...records.map((json) => ({ json, pairedItem: { item: index } })));
		} catch (error) {
			if (this.continueOnFail()) {
				returnData.push({
					json: { error: (error as Error).message },
					pairedItem: { item: index },
				});
				continue;
			}

			// The transport already maps API failures into NodeApiError and handlers raise
			// NodeOperationError for bad input, so those pass through rather than being wrapped a
			// second time and losing their message.
			throw error instanceof NodeApiError || error instanceof NodeOperationError
				? error
				: new NodeOperationError(this.getNode(), error as Error, { itemIndex: index });
		}
	}

	return [returnData];
}
