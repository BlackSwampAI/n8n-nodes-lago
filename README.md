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

The **Lago** node currently supports:

| Resource        | Operations                                                 |
| --------------- | ---------------------------------------------------------- |
| Billable Metric | Create, Get, Get Many, Update, Delete, Evaluate Expression |
| Customer        | Create or Update, Get, Get Many, Delete                    |
| Event           | Send, Send Batch, Get, Get Many, Estimate Fees             |
| Plan            | Create, Get, Get Many, Update, Delete                      |
| Plan Charge     | Create, Get, Get Many, Update, Delete                      |
| Subscription    | Create, Get, Get Many, Update, Terminate                   |

Further resources land per milestone: Invoice, Credit Note, Coupon,
Wallet, Wallet Transaction and Webhook Endpoint.

Usage events are the metering half of the integration. The **Billable Metric Code** is chosen
from the metrics defined in Lago rather than typed, because Lago accepts an event whose code
matches no active metric, stores it, and then never bills it — there is no error to notice.
Events are also aggregated asynchronously, so usage does not reflect a send immediately, and
Lago deduplicates on the transaction ID, which the node derives from the execution so an n8n
retry cannot double-bill.

Subscriptions are **terminated, not deleted** — the record is kept with a `terminated` status.
Note that Get Many returns only `active` subscriptions unless a status filter is set, and that a
terminated subscription reports as not found by Get while still appearing in Get Many. Sending
Create again with the same external ID and a different plan performs an **upgrade or downgrade**:
an upgrade replaces the subscription immediately, while a downgrade is queued as `pending` until
the period ends.

Plan charges price a billable metric on a plan, and every charge model — standard, package,
percentage, graduated, volume and dynamic — is offered as real fields rather than raw JSON.
Charge amounts are **decimal strings** (`"0.01"`), unlike plan amounts; Lago rejects a plain
number. Graduated Percentage requires a Lago premium licence.

Plan amounts are in the currency's **smallest unit** — `10000` is 100.00, not 10000.00. Plan
deletion is processed asynchronously, so a deleted plan stays readable for a moment afterwards.

Billable metric **expressions** address event properties as `event.properties.<key>` and the
event time as `event.timestamp`. The **Evaluate Expression** operation checks one against a
sample event, so a metering expression can be validated before any usage depends on it.

Customer has no update endpoint in the Lago API — `POST /customers` upserts on the external ID — so the node exposes a single **Create or Update** operation rather than implying semantics the API does not have.

A **Lago Trigger** node is planned, starting workflows from Lago's billing webhooks across the full event catalogue — customers, subscriptions, invoices, payments, wallets, plans, billable metrics, credit notes, fees and alerts.

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
