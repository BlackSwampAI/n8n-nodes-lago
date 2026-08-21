import type { INodePropertyOptions } from 'n8n-workflow';

/**
 * Every webhook event Lago can send, as the `event_types` field accepts them.
 *
 * GENERATED FILE — do not edit by hand. Run `npm run generate:webhook-events` after changing
 * the Lago image tag in docker-compose.yml. Generated from Lago v1.51.0.
 *
 * Three things make this list worth carrying rather than deriving:
 *
 * - The names are **dotted**. The OpenAPI specification documents the same events with
 *   underscores (`invoice_created`), and Lago rejects that form outright with
 *   `event_types: contains invalid types`.
 * - There is no API that lists them, so a dropdown cannot be loaded at runtime.
 * - The list grows between releases. Generating from the repository's default branch offered
 *   nine events a v1.51.0 server rejects, so it is pinned to the version the stack runs. A newer
 *   Lago may accept events beyond this list; it will never reject one that is in it.
 *
 * Deprecated events are excluded. Names are prefixed with Lago's own category so the list reads
 * as grouped in n8n's multi-select, which has no grouping of its own.
 */
export const WEBHOOK_EVENT_TYPES: INodePropertyOptions[] = [
	{
		name: 'Alerts — alert.triggered',
		value: 'alert.triggered',
		description: 'One or more thresholds defined in the alert were crossed',
	},
	{
		name: 'Billable Metrics — billable_metric.created',
		value: 'billable_metric.created',
		description: 'A new billable metric has been created',
	},
	{
		name: 'Billable Metrics — billable_metric.deleted',
		value: 'billable_metric.deleted',
		description: 'A billable metric has been deleted',
	},
	{
		name: 'Billable Metrics — billable_metric.updated',
		value: 'billable_metric.updated',
		description: 'A billable metric has been updated',
	},
	{
		name: 'Credit Notes — credit_note.created',
		value: 'credit_note.created',
		description: 'A new credit note has been created',
	},
	{
		name: 'Credit Notes — credit_note.generated',
		value: 'credit_note.generated',
		description: 'A new credit note PDF has been generated',
	},
	{
		name: 'Credit Notes — credit_note.provider_refund_failure',
		value: 'credit_note.provider_refund_failure',
		description: 'The refund of a credit note has failed on a payment provider',
	},
	{
		name: 'Customers — customer.accounting_provider_created',
		value: 'customer.accounting_provider_created',
		description: 'A customer was created on an accouting integration',
	},
	{
		name: 'Customers — customer.accounting_provider_error',
		value: 'customer.accounting_provider_error',
		description: 'An error was encountered while syncing a customer to an accounting provider',
	},
	{
		name: 'Customers — customer.checkout_url_generated',
		value: 'customer.checkout_url_generated',
		description: 'A checkout URL was generated for a customer',
	},
	{
		name: 'Customers — customer.created',
		value: 'customer.created',
		description: 'A new customer has been created',
	},
	{
		name: 'Customers — customer.crm_provider_created',
		value: 'customer.crm_provider_created',
		description: 'A customer has been created in the CRM provider',
	},
	{
		name: 'Customers — customer.crm_provider_error',
		value: 'customer.crm_provider_error',
		description: 'An error was encountered while syncing a customer to a CRM provider',
	},
	{
		name: 'Customers — customer.payment_provider_created',
		value: 'customer.payment_provider_created',
		description: 'A customer has been created on a payment provider',
	},
	{
		name: 'Customers — customer.payment_provider_error',
		value: 'customer.payment_provider_error',
		description: 'An error was encountered while syncing a customer to a payment provider',
	},
	{
		name: 'Customers — customer.tax_provider_error',
		value: 'customer.tax_provider_error',
		description: 'An error was encountered while fetching taxes for a customer on a tax provider',
	},
	{
		name: 'Customers — customer.updated',
		value: 'customer.updated',
		description: 'A customer has been updated',
	},
	{
		name: 'Customers — customer.vies_check',
		value: 'customer.vies_check',
		description: 'VIES VAT number has been checked for a customer',
	},
	{
		name: 'Dunning Campaigns — dunning_campaign.finished',
		value: 'dunning_campaign.finished',
		description: 'The dunning campaign has been completed for a customer',
	},
	{
		name: 'Event Ingestion — events.errors',
		value: 'events.errors',
		description: 'Errors were encountered while post-processing some events',
	},
	{
		name: 'Features — feature.created',
		value: 'feature.created',
		description: 'A new feature has been created',
	},
	{
		name: 'Features — feature.deleted',
		value: 'feature.deleted',
		description: 'A feature has been deleted',
	},
	{
		name: 'Features — feature.updated',
		value: 'feature.updated',
		description: 'A feature has been updated',
	},
	{
		name: 'Integrations — integration.provider_error',
		value: 'integration.provider_error',
		description: 'An error was encountered while processing data on an integration',
	},
	{
		name: 'Invoices — invoice.created',
		value: 'invoice.created',
		description: 'A new invoice has been emitted',
	},
	{
		name: 'Invoices — invoice.deleted',
		value: 'invoice.deleted',
		description: 'A draft invoice has been deleted',
	},
	{
		name: 'Invoices — invoice.drafted',
		value: 'invoice.drafted',
		description: 'A new draft invoice has been emitted',
	},
	{
		name: 'Invoices — invoice.generated',
		value: 'invoice.generated',
		description: 'A new invoice PDF has been generated',
	},
	{
		name: 'Invoices — invoice.one_off_created',
		value: 'invoice.one_off_created',
		description: 'A new one off invoice has been emitted',
	},
	{
		name: 'Invoices — invoice.paid_credit_added',
		value: 'invoice.paid_credit_added',
		description: 'A new prepaid credit invoice has been emitted',
	},
	{
		name: 'Invoices — invoice.payment_dispute_lost',
		value: 'invoice.payment_dispute_lost',
		description: 'A payment dispute has been lost for an invoice payment',
	},
	{
		name: 'Invoices — invoice.payment_failure',
		value: 'invoice.payment_failure',
		description: 'A payment attempt for an invoice has failed on a payment provider',
	},
	{
		name: 'Invoices — invoice.payment_overdue',
		value: 'invoice.payment_overdue',
		description: 'An invoice payment is overdue',
	},
	{
		name: 'Invoices — invoice.payment_status_updated',
		value: 'invoice.payment_status_updated',
		description: 'The payment status of an invoice has been updated',
	},
	{
		name: 'Invoices — invoice.ready_to_finalize',
		value: 'invoice.ready_to_finalize',
		description: 'A draft invoice is ready to be finalized (taxes are resolved)',
	},
	{
		name: 'Invoices — invoice.resynced',
		value: 'invoice.resynced',
		description: 'An invoice has been resynced with salesforce',
	},
	{
		name: 'Invoices — invoice.voided',
		value: 'invoice.voided',
		description: 'An invoice has been voided',
	},
	{
		name: 'Payment Receipts — payment_receipt.created',
		value: 'payment_receipt.created',
		description: 'A new payment receipt has been created',
	},
	{
		name: 'Payment Receipts — payment_receipt.generated',
		value: 'payment_receipt.generated',
		description: 'A new payment receipt PDF has been generated',
	},
	{
		name: 'Payments — payment_provider.error',
		value: 'payment_provider.error',
		description: 'An error was raised by a payment provider',
	},
	{
		name: 'Payments — payment_request.created',
		value: 'payment_request.created',
		description: 'A new payment request has been created',
	},
	{
		name: 'Payments — payment_request.payment_failure',
		value: 'payment_request.payment_failure',
		description: 'A payment attempt for a payment request has failed on a payment provider',
	},
	{
		name: 'Payments — payment_request.payment_status_updated',
		value: 'payment_request.payment_status_updated',
		description: 'The payment status of a payment request has been updated',
	},
	{
		name: 'Payments — payment.requires_action',
		value: 'payment.requires_action',
		description: 'An action is required to process a payment',
	},
	{
		name: 'Payments — payment.succeeded',
		value: 'payment.succeeded',
		description: 'A payment has been successfully processed by the payment provider',
	},
	{
		name: 'Plans — plan.created',
		value: 'plan.created',
		description: 'A new plan has been created',
	},
	{
		name: 'Plans — plan.deleted',
		value: 'plan.deleted',
		description: 'A plan has been deleted',
	},
	{
		name: 'Plans — plan.updated',
		value: 'plan.updated',
		description: 'A plan has been updated',
	},
	{
		name: 'Subscriptions and Fees — fee.created',
		value: 'fee.created',
		description: 'A pay in advance fee has been created',
	},
	{
		name: 'Subscriptions and Fees — fee.tax_provider_error',
		value: 'fee.tax_provider_error',
		description: 'An error was encountered while fetching taxes for a fee on a tax provider',
	},
	{
		name: 'Subscriptions and Fees — subscription.canceled',
		value: 'subscription.canceled',
		description: 'A subscription has been canceled',
	},
	{
		name: 'Subscriptions and Fees — subscription.incomplete',
		value: 'subscription.incomplete',
		description: 'A subscription is awaiting activation rule resolution before becoming active',
	},
	{
		name: 'Subscriptions and Fees — subscription.started',
		value: 'subscription.started',
		description: 'An subscription has started',
	},
	{
		name: 'Subscriptions and Fees — subscription.terminated',
		value: 'subscription.terminated',
		description: 'A subscription has been terminated',
	},
	{
		name: 'Subscriptions and Fees — subscription.termination_alert',
		value: 'subscription.termination_alert',
		description: 'A subscription will be terminated in the future',
	},
	{
		name: 'Subscriptions and Fees — subscription.trial_ended',
		value: 'subscription.trial_ended',
		description: 'A subscription trial period has ended',
	},
	{
		name: 'Subscriptions and Fees — subscription.updated',
		value: 'subscription.updated',
		description: 'A subscription has been updated',
	},
	{
		name: 'Subscriptions and Fees — subscription.usage_threshold_reached',
		value: 'subscription.usage_threshold_reached',
		description: 'A usage threshold has been reached by a subscription',
	},
	{
		name: 'Wallets and Credits — wallet_transaction.created',
		value: 'wallet_transaction.created',
		description: 'A new wallet transaction has been created',
	},
	{
		name: 'Wallets and Credits — wallet_transaction.payment_failure',
		value: 'wallet_transaction.payment_failure',
		description: 'A payment attempt for a wallet transaction has failed on a payment provider',
	},
	{
		name: 'Wallets and Credits — wallet_transaction.updated',
		value: 'wallet_transaction.updated',
		description: 'A wallet transaction has been updated',
	},
	{
		name: 'Wallets and Credits — wallet.created',
		value: 'wallet.created',
		description: 'A new wallet has been created',
	},
	{
		name: 'Wallets and Credits — wallet.depleted_ongoing_balance',
		value: 'wallet.depleted_ongoing_balance',
		description: 'The balance of a wallet has been depleted',
	},
	{
		name: 'Wallets and Credits — wallet.terminated',
		value: 'wallet.terminated',
		description: 'A wallet has been terminated',
	},
	{
		name: 'Wallets and Credits — wallet.updated',
		value: 'wallet.updated',
		description: 'A wallet has been updated',
	},
];
