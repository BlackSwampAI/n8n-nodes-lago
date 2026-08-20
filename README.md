# @blackswampai/n8n-nodes-lago

This is an n8n community node. It lets you use [Lago](https://www.getlago.com/) in your n8n workflows.

Lago is an open-source billing and metering platform for subscription, usage-based, and hybrid pricing. It turns raw usage events into invoices, and covers plans, prepaid credit wallets, coupons, credit notes, and the billing lifecycle around them.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/reference/license/) workflow automation platform.

[Installation](#installation)
[Operations](#operations)
[Credentials](#credentials)
[Compatibility](#compatibility)
[Usage](#usage)
[Resources](#resources)
[Version history](#version-history)

> **Pre-release.** This package is under active development and has not been published yet. The operations below describe the planned 0.1.0 surface.

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.

## Operations

The **Lago** node is planned to support these resources:

| Resource           | Operations                                                              |
| ------------------ | ----------------------------------------------------------------------- |
| Customer           | Create or Update, Get, Get Many, Delete                                 |
| Billable Metric    | Create, Get, Get Many, Update, Delete, Evaluate Expression              |
| Plan               | Create, Get, Get Many, Update, Delete                                   |
| Plan Charge        | Create, Get, Get Many, Update, Delete                                   |
| Subscription       | Create, Get, Get Many, Update, Terminate                                |
| Event              | Send, Send Batch, Get, Get Many, Estimate Fees                          |
| Invoice            | Get, Get Many, Update, Finalize, Void, Refresh, Retry Payment, Download |
| Credit Note        | Create, Get, Get Many                                                   |
| Coupon             | Create, Get, Get Many, Update, Delete, Apply to Customer                |
| Wallet             | Create, Get, Get Many, Update, Terminate                                |
| Wallet Transaction | Create, Get Many                                                        |
| Webhook Endpoint   | Create, Get, Get Many, Update, Delete                                   |

Customer has no update endpoint in the Lago API — `POST /customers` upserts on the external ID — so the node exposes a single **Create or Update** operation rather than implying semantics the API does not have.

The **Lago Trigger** node starts a workflow from Lago's billing webhooks, covering the event catalogue across customers, subscriptions, invoices, payments, wallets, plans, billable metrics, credit notes, fees, and alerts.

## Credentials

You need a Lago API key. Either:

- **Lago Cloud** — sign up at [getlago.com](https://www.getlago.com/) and copy the API key from your account settings, or
- **Self-hosted** — [deploy Lago](https://docs.getlago.com/guide/lago-self-hosted/overview) with Docker Compose or the official Helm charts, then take the API key from your instance.

The credential takes a **Base URL** and an **API Key**. Self-hosted instances are a first-class target: set the Base URL to your own instance instead of the default.

| Deployment      | Base URL                     |
| --------------- | ---------------------------- |
| Lago Cloud (US) | `https://api.getlago.com`    |
| Lago Cloud (EU) | `https://api.eu.getlago.com` |
| Self-hosted     | your instance URL            |

Lago authenticates with a bearer token, and the credential test verifies that the Base URL is reachable and the API key is accepted.

### Webhook signatures

The Lago Trigger verifies every delivery before it starts a workflow. Lago signs webhooks with either **JWT** (RS256) or **HMAC** (SHA-256), chosen per webhook endpoint.

JWT is the default and needs no extra configuration: the node fetches Lago's public key using the API key it already has. HMAC uses an organization-level key that the REST API does not expose, so you must copy it from the Lago dashboard into the credential yourself.

## Compatibility

Requires n8n 1.x and Node.js 22.22.0 or later. Tested against the free self-hosted edition of Lago and Lago Cloud.

Some Lago functionality is premium-only, including per-subscription charge and fixed-charge overrides. The node does not require a premium license, and operations that depend on one are marked in the node UI.

## Usage

Lago's core loop is: define a **billable metric**, attach it to a **plan** as a charge, subscribe a **customer** to that plan, then send **usage events** as your product is consumed. Lago aggregates the events and generates invoices.

A typical usage-metering workflow sends one event per unit of consumption:

```
Your app  ->  n8n  ->  Lago: Event: Send
                        external_subscription_id: acme-prod
                        code: ai_tokens
                        properties: { tokens: 143217, model: example-model }
```

Event sending is idempotent on the transaction ID, and Lago deduplicates on it, so retries never double-bill. The node defaults the transaction ID from the n8n execution, which makes ordinary n8n retries safe without any configuration.

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- [Lago documentation](https://docs.getlago.com/)
- [Lago API reference](https://docs.getlago.com/api-reference/intro)
- [Lago webhook reference](https://docs.getlago.com/api-reference/webhooks/format---signature)

## Version history

### 0.1.0 (unreleased)

Initial release.

## License

[MIT](LICENSE.md)
