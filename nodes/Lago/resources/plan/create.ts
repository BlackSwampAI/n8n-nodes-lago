import type { IDataObject, INodeProperties, JsonObject } from 'n8n-workflow';
import { lagoApiRequest } from '../../shared/transport';
import type { OperationHandler } from '../../shared/types';
import { INTERVALS_BILLABLE_MONTHLY, planFields, toTaxCodes } from './fields';

export const createFields: INodeProperties[] = planFields('create');

export const create: OperationHandler = async function (index) {
	const code = this.getNodeParameter('code', index) as string;
	const interval = this.getNodeParameter('interval', index) as string;
	const additionalFields = this.getNodeParameter('additionalFields', index, {}) as IDataObject;

	const plan: IDataObject = {
		code,
		name: this.getNodeParameter('name', index) as string,
		interval,
		amount_cents: this.getNodeParameter('amountCents', index) as number,
		amount_currency: this.getNodeParameter('amountCurrency', index) as string,
		pay_in_advance: this.getNodeParameter('payInAdvance', index, false) as boolean,
		...additionalFields,
	};

	// Read only where the field is actually shown, so a stale value left behind by switching the
	// interval is not sent on a plan that would silently drop it.
	if (INTERVALS_BILLABLE_MONTHLY.includes(interval)) {
		plan.bill_charges_monthly = this.getNodeParameter(
			'billChargesMonthly',
			index,
			false,
		) as boolean;
	}

	const taxCodes = toTaxCodes(additionalFields.tax_codes);
	if (taxCodes) plan.tax_codes = taxCodes;
	else delete plan.tax_codes;

	const response = await lagoApiRequest.call(this, 'POST', '/plans', {
		body: { plan },
		resource: 'Plan',
		resourceId: code,
	});

	return response.plan as JsonObject;
};
