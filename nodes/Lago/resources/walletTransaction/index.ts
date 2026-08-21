import type { IDataObject, INodeProperties, JsonObject } from 'n8n-workflow';
import { lagoApiRequest, lagoApiRequestAllItems } from '../../shared/transport';
import { listPaginationFields } from '../../shared/descriptions';
import type { OperationHandler, OperationHandlers } from '../../shared/types';

const showOnly = { resource: ['walletTransaction'] };
const scope = (operation: string) => ({ resource: ['walletTransaction'], operation: [operation] });

function walletIdField(operation: string): INodeProperties {
	return {
		displayName: 'Wallet ID',
		name: 'walletId',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. 1a901a90-1a90-1a90-1a90-1a901a901a90',
		description: 'Lago’s internal ID for the wallet, returned as lago_id by Wallet: Get Many',
		displayOptions: { show: scope(operation) },
	};
}

export const walletTransactionDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		default: 'create',
		displayOptions: { show: showOnly },
		options: [
			{
				name: 'Create',
				value: 'create',
				action: 'Top up or void wallet credits',
				// One request can produce several transactions, which is why the operation is not
				// named for a single one.
				description:
					'Add or remove credits on a wallet. Paid and granted credits are recorded as separate transactions, so this can return more than one item.',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many wallet transactions',
				description: 'Retrieve the transactions on a wallet',
			},
		],
	},

	walletIdField('create'),
	{
		displayName: 'Paid Credits',
		name: 'paidCredits',
		type: 'string',
		default: '0',
		// Recorded as pending until the top-up invoice is paid, so the balance does not move yet.
		description:
			'Credits the customer is paying for. Recorded as a pending transaction until payment settles, so the balance does not move immediately.',
		displayOptions: { show: scope('create') },
	},
	{
		displayName: 'Granted Credits',
		name: 'grantedCredits',
		type: 'string',
		default: '0',
		description: 'Credits given free of charge. These settle immediately.',
		displayOptions: { show: scope('create') },
	},
	{
		// Shown in the panel rather than left to the field tooltip, because this failure is
		// silent: the request succeeds, the transaction is created, and the balance is simply
		// lower than expected — which reads as the node losing credits rather than Lago holding
		// them. Hidden when no paid credits are being added, so it only appears when it applies.
		displayName:
			'Paid credits are recorded as <b>pending</b> until the top-up invoice is paid, and are not included in the wallet balance until then. Granted credits settle immediately.',
		name: 'paidCreditsNotice',
		type: 'notice',
		default: '',
		displayOptions: {
			show: { ...scope('create') },
			hide: { paidCredits: ['0', ''] },
		},
	},
	{
		displayName: 'Voided Credits',
		name: 'voidedCredits',
		type: 'string',
		default: '0',
		description: 'Credits to take back off the wallet, recorded as an outbound transaction',
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
				displayName: 'Invoice Requires Successful Payment',
				name: 'invoice_requires_successful_payment',
				type: 'boolean',
				default: false,
				description: 'Whether credits are only granted once the top-up invoice is paid',
			},
			{
				displayName: 'Metadata',
				name: 'metadata',
				type: 'string',
				default: '',
				placeholder: 'e.g. order-4821',
				description: 'Free-text reference stored against the transaction',
			},
		],
	},

	walletIdField('getAll'),
	...listPaginationFields(scope('getAll')),
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: scope('getAll') },
		options: [
			{
				displayName: 'Status',
				name: 'status',
				type: 'options',
				default: 'settled',
				description: 'Pending transactions are awaiting payment and are not in the balance yet',
				options: [
					{ name: 'Pending', value: 'pending' },
					{ name: 'Settled', value: 'settled' },
				],
			},
			{
				displayName: 'Transaction Type',
				name: 'transaction_type',
				type: 'options',
				default: 'inbound',
				options: [
					{ name: 'Inbound', value: 'inbound' },
					{ name: 'Outbound', value: 'outbound' },
				],
			},
		],
	},
];

const create: OperationHandler = async function (index) {
	const walletId = this.getNodeParameter('walletId', index) as string;
	const additionalFields = this.getNodeParameter('additionalFields', index, {}) as IDataObject;

	const walletTransaction: IDataObject = {
		wallet_id: walletId,
		paid_credits: String(this.getNodeParameter('paidCredits', index, '0') ?? '0').trim(),
		granted_credits: String(this.getNodeParameter('grantedCredits', index, '0') ?? '0').trim(),
		voided_credits: String(this.getNodeParameter('voidedCredits', index, '0') ?? '0').trim(),
		...additionalFields,
	};

	const response = await lagoApiRequest.call(this, 'POST', '/wallet_transactions', {
		body: { wallet_transaction: walletTransaction },
		resource: 'Wallet Transaction',
		resourceId: walletId,
	});

	// Paid and granted credits become separate transactions, so the response is a collection even
	// for a single request. Returned as one item each so downstream nodes can act per transaction.
	return (response.wallet_transactions ?? []) as JsonObject[];
};

const getAll: OperationHandler = async function (index) {
	const walletId = this.getNodeParameter('walletId', index) as string;
	const returnAll = this.getNodeParameter('returnAll', index, false) as boolean;
	const limit = returnAll ? 0 : (this.getNodeParameter('limit', index, 50) as number);
	const filters = this.getNodeParameter('filters', index, {}) as IDataObject;

	return lagoApiRequestAllItems<JsonObject>(
		this,
		`/wallets/${encodeURIComponent(walletId)}/wallet_transactions`,
		'wallet_transactions',
		{ returnAll, limit, query: { ...filters }, resource: 'Wallet Transaction' },
	);
};

export const walletTransactionOperations: OperationHandlers = { create, getAll };
