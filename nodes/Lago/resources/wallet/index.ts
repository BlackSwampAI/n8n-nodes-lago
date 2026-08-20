import type { IDataObject, INodeProperties, JsonObject } from 'n8n-workflow';
import { lagoApiRequest, lagoApiRequestAllItems } from '../../shared/transport';
import { listPaginationFields } from '../../shared/descriptions';
import type { OperationHandler, OperationHandlers } from '../../shared/types';

const showOnlyForWallets = { resource: ['wallet'] };
const scope = (operation: string) => ({ resource: ['wallet'], operation: [operation] });

/** Wallets are addressed by Lago's own UUID, as invoices and credit notes are. */
function walletIdField(operation: string): INodeProperties {
	return {
		displayName: 'Wallet ID',
		name: 'walletId',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. 1a901a90-1a90-1a90-1a90-1a901a901a90',
		description: 'Lago’s internal ID for the wallet, returned as lago_id by Get Many',
		displayOptions: { show: scope(operation) },
	};
}

export const walletDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		default: 'create',
		displayOptions: { show: showOnlyForWallets },
		options: [
			{
				name: 'Create',
				value: 'create',
				action: 'Create a wallet',
				description: 'Open a prepaid credit wallet for a customer',
			},
			{
				name: 'Get',
				value: 'get',
				action: 'Get a wallet',
				description: 'Retrieve a single wallet',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many wallets',
				description: 'Retrieve many wallets',
			},
			{
				name: 'Terminate',
				value: 'terminate',
				action: 'Terminate a wallet',
				// DELETE ends the wallet and keeps it, as subscription termination does.
				description:
					'Close a wallet. The record is kept with a terminated status rather than removed.',
			},
			{
				name: 'Update',
				value: 'update',
				action: 'Update a wallet',
				description: 'Update a wallet',
			},
		],
	},

	{
		displayName: 'Customer External ID',
		name: 'externalCustomerId',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. acme-corp',
		displayOptions: { show: scope('create') },
	},
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. Prepaid Credits',
		displayOptions: { show: scope('create') },
	},
	{
		displayName: 'Currency',
		name: 'currency',
		type: 'string',
		default: 'USD',
		required: true,
		placeholder: 'e.g. USD',
		displayOptions: { show: scope('create') },
	},
	{
		displayName: 'Rate Amount',
		name: 'rateAmount',
		type: 'string',
		default: '1',
		required: true,
		placeholder: 'e.g. 1',
		// Sent as text so the decimal survives exactly, as elsewhere in Lago's money fields.
		description: 'Currency value of one credit, as a decimal. A rate of 1 means 1 credit = 1 unit.',
		displayOptions: { show: scope('create') },
	},
	{
		displayName: 'Paid Credits',
		name: 'paidCredits',
		type: 'string',
		default: '0',
		// Paid credits are recorded as a pending transaction until payment settles, so they do not
		// appear in the balance straight away. Granted credits settle immediately.
		description:
			'Credits the customer is paying for. These are recorded as pending until payment settles, so they do not appear in the balance immediately.',
		displayOptions: { show: scope('create') },
	},
	{
		displayName: 'Granted Credits',
		name: 'grantedCredits',
		type: 'string',
		default: '0',
		description:
			'Credits given free of charge. These settle immediately and appear in the balance.',
		displayOptions: { show: scope('create') },
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: scope('create') },
		options: [
			{
				displayName: 'Billable Metric Codes',
				name: 'billable_metric_codes',
				type: 'string',
				default: '',
				placeholder: 'e.g. ai_tokens,api_requests',
				description:
					'Comma-separated metric codes the credits may be spent on. Leave empty for all.',
			},
			{
				displayName: 'Expiration Date',
				name: 'expiration_at',
				type: 'dateTime',
				default: '',
				description: 'When unspent credits expire',
			},
			{
				displayName: 'Fee Types',
				name: 'fee_types',
				type: 'multiOptions',
				default: [],
				description: 'Kinds of fee the credits may be spent on. Leave empty for all.',
				options: [
					{ name: 'Charge', value: 'charge' },
					{ name: 'Commitment', value: 'commitment' },
					{ name: 'Subscription', value: 'subscription' },
				],
			},
			{
				displayName: 'Invoice Requires Successful Payment',
				name: 'invoice_requires_successful_payment',
				type: 'boolean',
				default: false,
				description: 'Whether credits are only granted once the top-up invoice is paid',
			},
		],
	},

	walletIdField('get'),
	walletIdField('terminate'),
	walletIdField('update'),
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: scope('update') },
		options: [
			{
				displayName: 'Expiration Date',
				name: 'expiration_at',
				type: 'dateTime',
				default: '',
			},
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
			},
		],
	},

	...listPaginationFields(scope('getAll')),
	{
		displayName: 'Customer External ID',
		name: 'filterCustomerId',
		type: 'string',
		default: '',
		placeholder: 'e.g. acme-corp',
		description: 'Return only this customer’s wallets. Leave empty for all.',
		displayOptions: { show: scope('getAll') },
	},
];

/** Splits a comma-separated field into the array Lago expects, or nothing at all. */
function toList(value: unknown): string[] | undefined {
	if (typeof value !== 'string') return undefined;
	const entries = value
		.split(',')
		.map((entry) => entry.trim())
		.filter(Boolean);
	return entries.length ? entries : undefined;
}

const create: OperationHandler = async function (index) {
	const additionalFields = this.getNodeParameter('additionalFields', index, {}) as IDataObject;

	const wallet: IDataObject = {
		external_customer_id: this.getNodeParameter('externalCustomerId', index) as string,
		name: this.getNodeParameter('name', index) as string,
		currency: this.getNodeParameter('currency', index) as string,
		rate_amount: String(this.getNodeParameter('rateAmount', index, '1') ?? '1').trim(),
		paid_credits: String(this.getNodeParameter('paidCredits', index, '0') ?? '0').trim(),
		granted_credits: String(this.getNodeParameter('grantedCredits', index, '0') ?? '0').trim(),
	};

	if (additionalFields.expiration_at) {
		wallet.expiration_at = new Date(additionalFields.expiration_at as string).toISOString();
	}
	if (additionalFields.invoice_requires_successful_payment !== undefined) {
		wallet.invoice_requires_successful_payment =
			additionalFields.invoice_requires_successful_payment;
	}

	const feeTypes = Array.isArray(additionalFields.fee_types)
		? additionalFields.fee_types
		: undefined;
	const metricCodes = toList(additionalFields.billable_metric_codes);
	if (feeTypes?.length || metricCodes) {
		const appliesTo: IDataObject = {};
		if (feeTypes?.length) appliesTo.fee_types = feeTypes;
		if (metricCodes) appliesTo.billable_metric_codes = metricCodes;
		wallet.applies_to = appliesTo;
	}

	const response = await lagoApiRequest.call(this, 'POST', '/wallets', {
		body: { wallet },
		resource: 'Wallet',
	});

	return response.wallet as JsonObject;
};

const get: OperationHandler = async function (index) {
	const walletId = this.getNodeParameter('walletId', index) as string;
	const response = await lagoApiRequest.call(
		this,
		'GET',
		`/wallets/${encodeURIComponent(walletId)}`,
		{
			resource: 'Wallet',
			resourceId: walletId,
		},
	);
	return response.wallet as JsonObject;
};

const getAll: OperationHandler = async function (index) {
	const returnAll = this.getNodeParameter('returnAll', index, false) as boolean;
	const limit = returnAll ? 0 : (this.getNodeParameter('limit', index, 50) as number);
	const externalCustomerId = this.getNodeParameter('filterCustomerId', index, '') as string;

	return lagoApiRequestAllItems<JsonObject>(this, '/wallets', 'wallets', {
		returnAll,
		limit,
		query: { external_customer_id: externalCustomerId },
		resource: 'Wallet',
	});
};

const update: OperationHandler = async function (index) {
	const walletId = this.getNodeParameter('walletId', index) as string;
	const updateFields = this.getNodeParameter('updateFields', index, {}) as IDataObject;

	const wallet: IDataObject = { ...updateFields };
	if (updateFields.expiration_at) {
		wallet.expiration_at = new Date(updateFields.expiration_at as string).toISOString();
	}

	const response = await lagoApiRequest.call(
		this,
		'PUT',
		`/wallets/${encodeURIComponent(walletId)}`,
		{
			body: { wallet },
			resource: 'Wallet',
			resourceId: walletId,
		},
	);
	return response.wallet as JsonObject;
};

const terminate: OperationHandler = async function (index) {
	const walletId = this.getNodeParameter('walletId', index) as string;
	const response = await lagoApiRequest.call(
		this,
		'DELETE',
		`/wallets/${encodeURIComponent(walletId)}`,
		{ resource: 'Wallet', resourceId: walletId },
	);
	return response.wallet as JsonObject;
};

export const walletOperations: OperationHandlers = {
	create,
	get,
	getAll,
	update,
	terminate,
};
