import type { IDataObject, INodeProperties, JsonObject } from 'n8n-workflow';
import { lagoApiRequest } from '../../shared/transport';
import type { OperationHandler } from '../../shared/types';
import { buildRanges, chargeFields } from './fields';

export const createFields: INodeProperties[] = chargeFields('create');

/** Collects the properties belonging to the selected charge model, and only those. */
export function readChargeProperties(
	this: IDataObject,
	get: (name: string, fallback?: unknown) => unknown,
	chargeModel: string,
): IDataObject {
	const properties: IDataObject = {};
	const text = (name: string) => String(get(name, '') ?? '').trim();

	switch (chargeModel) {
		case 'standard':
			properties.amount = text('amount');
			break;
		case 'package':
			properties.amount = text('packageAmount');
			properties.package_size = Number(get('packageSize', 0));
			properties.free_units = Number(get('freeUnits', 0));
			break;
		case 'percentage': {
			properties.rate = text('rate');
			const fixed = text('fixedAmount');
			if (fixed) properties.fixed_amount = fixed;
			const extra = (get('percentageOptions', {}) ?? {}) as IDataObject;
			for (const [key, value] of Object.entries(extra)) {
				if (value === '' || value === undefined || value === null) continue;
				properties[key] = typeof value === 'number' ? value : String(value);
			}
			break;
		}
		case 'graduated':
			properties.graduated_ranges = buildRanges(
				(get('graduatedRanges.range', []) ?? []) as IDataObject[],
			);
			break;
		case 'volume':
			properties.volume_ranges = buildRanges(
				(get('volumeRanges.range', []) ?? []) as IDataObject[],
			);
			break;
		case 'graduated_percentage':
			properties.graduated_percentage_ranges = buildRanges(
				(get('graduatedPercentageRanges.range', []) ?? []) as IDataObject[],
			);
			break;
		default:
			// `dynamic` takes its amount from the event, so it carries no properties of its own.
			break;
	}

	return properties;
}

export const create: OperationHandler = async function (index) {
	const planCode = this.getNodeParameter('planCode', index) as string;
	const chargeCode = this.getNodeParameter('chargeCode', index) as string;
	const chargeModel = this.getNodeParameter('chargeModel', index) as string;
	const additionalFields = this.getNodeParameter('additionalFields', index, {}) as IDataObject;

	const get = (name: string, fallback?: unknown) => this.getNodeParameter(name, index, fallback);
	const properties = readChargeProperties.call({}, get, chargeModel);

	const charge: IDataObject = {
		billable_metric_id: this.getNodeParameter('billableMetricId', index) as string,
		code: chargeCode,
		charge_model: chargeModel,
		...additionalFields,
	};
	if (Object.keys(properties).length > 0) charge.properties = properties;

	const response = await lagoApiRequest.call(
		this,
		'POST',
		`/plans/${encodeURIComponent(planCode)}/charges`,
		{ body: { charge }, resource: 'Plan Charge', resourceId: chargeCode },
	);

	return response.charge as JsonObject;
};
