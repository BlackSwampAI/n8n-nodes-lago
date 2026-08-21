# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - Unreleased

First release. Covers the billing lifecycle end to end: define what is measured, price it,
subscribe a customer, meter usage, and act on what Lago produces.

### Added

**Lago node** — 12 resources:

| Resource | Operations |
| --- | --- |
| Billable Metric | Create, Get, Get Many, Update, Delete, Evaluate Expression |
| Coupon | Create, Get, Get Many, Update, Delete, Apply to Customer, Get Many Applied, Remove from Customer |
| Credit Note | Create, Estimate, Get, Get Many, Download, Void |
| Customer | Create or Update, Get, Get Many, Delete |
| Event | Send, Send Batch, Get, Get Many, Estimate Fees |
| Invoice | Create One-Off, Get, Get Many, Update, Finalize, Void, Download, Retry Payment |
| Plan | Create, Get, Get Many, Update, Delete |
| Plan Charge | Create, Get, Get Many, Update, Delete |
| Subscription | Create, Get, Get Many, Update, Terminate |
| Wallet | Create, Get, Get Many, Update, Terminate |
| Wallet Transaction | Create, Get Many |
| Webhook Endpoint | Create, Get, Get Many, Update, Delete |

**Lago Trigger** — starts a workflow from any of Lago's 65 billing events. Registers its own
webhook endpoint on activation and removes it on deactivation, reusing an existing endpoint for
the same URL rather than adding another. Every delivery is verified before the workflow runs,
with JWT by default or HMAC, and repeat deliveries are recognised and skipped.

**Credentials** — one credential for both nodes, supporting Lago Cloud and self-hosted
instances, with a connection test.

### Notes

Behaviours that differ from what the API's shape suggests, each surfaced in the relevant field
or operation description:

- Customer has no update endpoint; `POST /customers` upserts, so the node offers a single
  **Create or Update** operation.
- Subscriptions and wallets are **terminated, not deleted** — the record is kept.
- Sending Create again with the same subscription external ID and a different plan performs an
  upgrade or a downgrade.
- One-off invoices are issued **already finalized**, and finalizing an already-finalized invoice
  is reported by Lago as *not found*.
- Invoice and credit note PDFs render **asynchronously**, so a file URL may be empty on the
  first call.
- Paid wallet credits stay **pending** until the top-up invoice is paid and do not appear in the
  balance; granted credits settle immediately. Shown as a notice in the panel, since the request
  succeeds and nothing signals the shortfall.
- An event whose billable metric code matches nothing is **accepted and never billed**, which is
  why the code is chosen from a list rather than typed and why the panel says so outright.
- Plan amounts are integer cents; plan charge amounts are decimal strings.

Features requiring a Lago premium licence are marked in the operation or field description:
credit note creation and estimation, the graduated percentage charge model, invoice refresh,
customer timezones, charge minimum amounts, and invoice grace periods. Automatic recurring
wallet top-ups are not exposed, because the free edition answers HTTP 500 rather than refusing
cleanly.

[0.1.0]: https://github.com/BlackSwampAI/n8n-nodes-lago/releases/tag/v0.1.0
