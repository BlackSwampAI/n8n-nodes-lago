# Lago n8n Node — Pre-Implementation Technical Audit

**Date:** 2026-08-20
**Repo:** `BlackSwampAI/n8n-nodes-lago` (proposed)
**Audited against:** Lago OpenAPI `1.51.0`, `docs.getlago.com`, npm registry, n8n `nodes-base`
**Verdict:** **GO — confirmed**, with two blockers to resolve before the first tag.

> **Status: delivered.** This audit preceded implementation and is kept as the record of what
> Lago's API actually does, which diverged from its own specification repeatedly. Version 0.1.0
> shipped on 2026-08-21 with 12 resources and a trigger. Sections 1–17 are the original
> pre-implementation analysis; sections 18–19 record what the live API taught us during the
> build. Where the two disagree, the later sections are right.

---

## 0. Executive summary

The handoff's STRONG GO holds. Lago's API is larger and better-shaped for n8n than the handoff assumed: 122 REST paths and a **61-event webhook catalogue** with per-endpoint event filtering, signed payloads, and an idempotency key. The Trigger will be the standout feature, exactly as predicted.

Six findings change the plan:

| #   | Finding                                                                                                               | Impact                                                            |
| --- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 1   | ~~`n8n-nodes-lago@0.1.0` tombstone~~ — **resolved 2026-08-20**: shipping as the scoped `@blackswampai/n8n-nodes-lago` | Blocker dissolved; `0.1.0` is available again under the new name  |
| 2   | Existing competitor `n8n-nodes-lago-api@0.1.1` is abandoned (single publish, GitHub repo 404)                         | Confirms the opportunity                                          |
| 3   | Lago's OpenAPI spec is **AGPLv3**                                                                                     | Cannot copy field descriptions verbatim into an MIT package       |
| 4   | **Customer has no `PUT`** — update is an upsert via `POST /customers`                                                 | Corrects the MVP matrix                                           |
| 5   | HMAC uses an **organization-level key not exposed by the API**; JWT's public key _is_ fetchable                       | Trigger should default to JWT                                     |
| 6   | n8n verification forbids runtime dependencies                                                                         | Signature verification must use `node:crypto`, not `jsonwebtoken` |

---

## 1. npm name status — **BLOCKER**

The registry tombstone, fetched directly:

```json
{
	"_id": "n8n-nodes-lago",
	"name": "n8n-nodes-lago",
	"time": {
		"created": "2025-04-19T10:34:51.014Z",
		"0.1.0": "2025-04-19T10:34:51.220Z",
		"unpublished": { "time": "2025-04-19T10:41:20.114Z", "versions": ["0.1.0"] }
	}
}
```

`npm view n8n-nodes-lago` returns `E404 — Unpublished on 2025-04-19`. The author published `0.1.0`, unpublished it seven minutes later, and republished under `n8n-nodes-lago-api`.

Consequences:

- **The name is claimable.** npm's 24-hour reuse hold expired 16 months ago. `BlackSwampAI/n8n-nodes-lago` remains viable.
- **The version `0.1.0` is very likely permanently burned under this name.** npm does not allow a previously-published `name@version` to be republished, and the tombstone records `0.1.0` explicitly.

This collides with the template, which hardwires 0.1.0 in three places:

- `RELEASING.md` — "First publication as 0.1.0"
- `scripts/release-check.mjs` — audits the release configuration for the first tag
- `.github/ISSUE_TEMPLATE/release-0.1.0.md`

### Resolution (2026-08-20)

The package ships as **`@blackswampai/n8n-nodes-lago`**, matching the existing
`@blackswampai/n8n-nodes-studiocms` and `@blackswampai/n8n-nodes-medusa`.

This dissolves the blocker: a scoped name is a distinct package, so **`0.1.0` is available
again** and the template's first-release flow needs no version surgery. Three consequences remain:

- **The scope is lowercase.** npm rejects uppercase in package names, so it is
  `@blackswampai/...`, not `@BlackSwampAI/...`.
- **`scripts/release-check.mjs` will reject the name.** Its regex is
  `/^n8n-nodes-[a-z0-9][a-z0-9._-]*$/`, which does not admit a scope. It must be widened to
  `/^(@[a-z0-9][a-z0-9._-]*\/)?n8n-nodes-[a-z0-9][a-z0-9._-]*$/` in PR 0.
- **`publishConfig.access: "public"` becomes load-bearing.** Scoped packages default to
  restricted; the template already sets this, and `release-check.mjs` already asserts it.

n8n permits scoped community nodes — the documented rule is that a package must be named
`n8n-nodes-*` **or** `@<scope>/n8n-nodes-*`. Verified.

The unscoped `n8n-nodes-lago` remains unclaimed and its `0.1.0` remains permanently burned;
we are simply no longer using it.

---

## 2. Official integration status — clear

- No `Lago` directory in `n8n-io/n8n/packages/nodes-base/nodes`.
- No vendor-maintained n8n node found; Lago's own npm org (`lago_tech`) publishes `lago-javascript-client`, `lago-agent-sdk`, and `lago-expression` — **no n8n package**.
- Lago is investing in AI-adjacent integration surface (an MCP server, `lago-agent-sdk` for LLM metering, shipped 2026). This raises the long-term probability of an official n8n node. It does not block now, but **re-check immediately before publishing**, per the Black Swamp rule.

## 3. Community competition — negligible

| Package              | Version | Published   | Status                                                 |
| -------------------- | ------- | ----------- | ------------------------------------------------------ |
| `n8n-nodes-lago-api` | 0.1.1   | 2025-04-19  | Single publish, never updated; GitHub repo returns 404 |
| `n8n-nodes-lago`     | —       | unpublished | Tombstoned                                             |

The competitor ships **one node** (`Lagoapi.node.js`), **one credential**, **no trigger**, and declares `pnpm >=9.1` / `node >=18.10`. Its `author` field is spoofed as `Lago <tech@getlago.com>` while the maintainer is a personal account — worth noting, since users may mistake it for official. There is no meaningful incumbent.

## 4. Licensing — new constraint

Lago's OpenAPI spec is licensed **AGPLv3** (`info.license` in `openapi.yaml`), as is the Lago platform. The n8n verification requirement is **MIT**.

Consuming a REST API creates no derivative work, so the node itself is unproblematic. But **do not paste `description:` strings, examples, or enum documentation verbatim** from the spec into node properties — that is copying AGPL-licensed text into an MIT package. Paraphrase all user-facing descriptions. This reinforces the handoff's "do not auto-generate from OpenAPI" rule with a legal reason, not just a UX one.

---

## 5. API capability matrix (OpenAPI 1.51.0)

122 paths across 24 tags. Operation counts by tag:

```
wallets            30      customers          15      taxes               5
plans              24      credit_notes       11      add_ons             5
subscriptions      24      entitlements       10      webhook_endpoints   5
invoices           14      coupons             8      billing_entities    4
                           events              7      fees                4
                           analytics           6      payments            3
                           billable_metrics    6      payment_requests    3
                           features            6      payment_methods     3
                                                      activity_logs       2
                                                      api_logs            2
                                                      payment_receipts    2
                                                      organizations       1
```

### Corrections to the handoff's assumed matrix

**Customer — no update endpoint.** The path `/customers/{external_customer_id}` supports only `GET` and `DELETE`. Creation and update both go through `POST /customers`, which **upserts** on `external_id`. Expose this as `Create or Update` rather than separate Create/Update operations, or the node will imply semantics the API does not have.

Customer also carries nine sub-resources worth surfacing later: `applied_coupons`, `credit_notes`, `invoices`, `payments`, `payment_requests`, `subscriptions`, `current_usage`, `projected_usage`, `past_usage`, plus `portal_url` and `checkout_url`.

**Wallets — two parallel API families.** This is the single largest design decision in the MVP:

| Customer-scoped (legacy shape)                      | Top-level (newer)                   |
| --------------------------------------------------- | ----------------------------------- |
| `POST /customers/{ext_id}/wallets`                  | `POST /wallets`                     |
| `GET/PUT/DELETE /customers/{ext_id}/wallets/{code}` | `GET/PUT/DELETE /wallets/{lago_id}` |

They address wallets by **different identifiers** — `code` vs `lago_id`. Mixing them in one resource will confuse users. **Recommendation:** build the MVP on the top-level `/wallets` family (`lago_id`-addressed, consistent with invoices/credit notes/fees), and expose `GET /customers/{ext_id}/wallets` only as a filter on Get Many. Verify against a live instance which family the current self-hosted release actually honours before committing.

**Subscriptions — `DELETE` is terminate.** `DELETE /subscriptions/{external_id}` is the terminate operation; `PUT` updates. Label the operation **Terminate**, not Delete. Note `subscription_status` is a query parameter on several subscription paths.

**Invoices — confirmed non-CRUD.** Available: `create` (one-off), `find`, `findAll`, `update`, `delete`, `download`, `finalize` (PUT), `void`, `refresh`, `retry`, `retry_payment`, `payment_url`, `preview`, `lose_dispute`. The handoff's caution was correct.

**Events — richer than assumed.** Beyond `POST /events`, `POST /events/batch`, `GET /events`, `GET /events/{transaction_id}`, there are three fee-estimation endpoints (`estimate_fees`, `estimate_instant_fees`, `batch_estimate_instant_fees`) that are genuinely useful for AI-billing preview workflows. Consider `Estimate Fees` for v0.1.0 — it is a differentiator no competitor offers.

**Newer resources absent from the handoff:** `features` + `entitlements` (feature-flag style entitlement billing, 16 ops), `billing_entities` (multi-entity billing), `payment_methods`, `payment_receipts`, `fixed_charges` on plans and subscriptions, and `evaluate_expression` for billable metrics. These are v0.2.x+ candidates, but `evaluate_expression` is a strong UX aid for the Billable Metric editor.

---

## 6. Free vs premium

Lago's public docs are **deliberately vague** — `docs.getlago.com/faq/pricing` says only "fundamental billing features" are free and defers to a marketing page with no feature table. The OpenAPI spec marks premium inline in only two places, both subscription-level overrides:

- `PUT /subscriptions/{external_id}/charges/{charge_code}` (`overrideSubscriptionCharge`) — "This is a premium feature."
- `PUT /subscriptions/{external_id}/fixed_charges/{fixed_charge_code}` (`overrideSubscriptionFixedCharge`) — "This is a premium feature."

Third-party sources additionally claim credit notes, the customer portal, dunning, and real-time balance observability are paid. **These claims conflict with the spec's silence and should not be trusted.**

**Recommendation:** do not plan premium boundaries from documentation. Stand up the free self-hosted edition early and **empirically probe every MVP endpoint**, recording which return a premium/forbidden error. That matrix becomes a test fixture and the source for README "requires Lago Premium" annotations. Until then, treat **Credit Note as at-risk for v0.1.0** — if manual credit-note creation is premium-gated, its integration tests cannot run in CI, which violates the handoff's own rule that CI must not depend on premium features. Keep Credit Note in the MVP but sequence its PR late, after the probe.

---

## 7. Authentication design

```
Base URL   default https://api.getlago.com   (EU: https://api.eu.getlago.com; self-hosted: custom)
Auth       Authorization: Bearer <API_KEY>
Path       all endpoints under /api/v1
```

The OpenAPI `servers` entries already include `/api/v1`. Decide once whether the credential's Base URL field means the **host** (`https://api.getlago.com`) or the **full API root** (`.../api/v1`), and normalise defensively — self-hosted users will paste both. Lago's own docs use `LAGO_URL="https://api.getlago.com"` with `/api/v1` appended by the caller; match that convention and strip a trailing `/api/v1` if supplied.

**Credential test:** `GET /billing_entities` or `GET /customers?per_page=1`. Prefer a cheap list endpoint over an org endpoint so a scoped key still passes. Distinguish in the error message: DNS/connection failure (bad Base URL, common on self-hosted) vs `401` (bad key).

---

## 8. Webhooks and the Lago Trigger

This is the strongest part of the integration. Everything the handoff hoped for is real.

**Headers on every webhook:**

| Header                       | Purpose            |
| ---------------------------- | ------------------ |
| `X-Lago-Signature`           | The signature      |
| `X-Lago-Signature-Algorithm` | `jwt` or `hmac`    |
| `X-Lago-Unique-Key`          | UUID — idempotency |

**Payload shape:** `{ "webhook_type": "...", "object_type": "...", "<object>": {...} }`

**Endpoint registration** supports `webhook_url`, `signature_algo` (`jwt` | `hmac` | null), `name`, and — critically — **`event_types[]`**. Lago filters server-side, so the Trigger can register exactly the events the user ticks. This enables the checkbox UX the handoff wanted, with no client-side filtering.

**61 events** across: invoice (13), customer (11), subscription (8), payment (6), wallet (4), plan (3), billable_metric (3), credit_note (3), feature (3), fee (2), event/events errors (2), alert, dunning, integration. Group them by object in a `multiOptions` field, per the handoff's mock.

### Signature verification — **default to JWT**

|               | JWT                                                                                                | HMAC                                                   |
| ------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Algorithm     | RS256                                                                                              | HMAC-SHA256, base64                                    |
| Key source    | `GET /webhooks/public_key` (base64 PEM) — **fetchable with the API key already in the credential** | **Organization HMAC key, not exposed by the REST API** |
| Config burden | None                                                                                               | User must copy the key from the Lago dashboard         |
| Lago default  | Yes                                                                                                | —                                                      |

JWT is Lago's default and is **zero-config for the node** — the Trigger can fetch and cache the public key using credentials it already has. HMAC requires an extra credential field the user must find manually. **Recommendation:** default the Trigger to `jwt`; offer `hmac` as an option with a conditionally-displayed "Organization HMAC Key" field.

**Self-hosted gotcha:** JWT verification validates `issuer`, documented as `https://api.getlago.com`. On self-hosted, the issuer is the instance's own API URL. Derive the expected issuer from the credential Base URL, and do not hardcode the cloud value — this will silently break every self-hosted user otherwise.

### Zero-dependency constraint — **verified as satisfiable**

n8n verification forbids runtime dependencies (`scripts/release-check.mjs` already enforces `dependencies == {}`). So `jsonwebtoken` is **not available**. Both algorithms are implementable with Node's built-in `crypto`:

- HMAC: `crypto.createHmac('sha256', key).update(rawBody).digest('base64')`, compared with `crypto.timingSafeEqual`.
- JWT RS256: split the token, `crypto.createVerify('RSA-SHA256')` over `header.payload` against the PEM, then check `iss` and compare the decoded `data` claim to the raw body.

Both require the **raw request body**, not the parsed JSON. Confirm early that n8n's webhook node exposes raw body access in this n8n version — this is the highest-risk unknown in the Trigger and should be spiked in PR 1, not discovered in PR 8.

### Lifecycle constraints

- **Maximum 10 webhook endpoints per organization.** A Trigger that auto-registers one endpoint per workflow activation will exhaust this fast. Design `checkExists` to reuse an endpoint matching the workflow's URL, and surface a clear error at the cap rather than a raw 422.
- **Lago retries 3 times** on non-2xx. Combined with `X-Lago-Unique-Key`, dedupe is worth implementing — at minimum document it; ideally use n8n's static data to hold a bounded recent-key set.

---

## 9. Pagination and filtering

Uniform `page` / `per_page` query parameters across list endpoints. Standard n8n treatment applies: `Return All` + `Limit`, with internal auto-pagination driving `page`.

Note the template's `GithubIssues` example paginates via **`Link` headers**, which Lago does **not** use. The `parseLinkHeader` pattern in `nodes/GithubIssues/resources/issue/getAll.ts` is not reusable here. Lago returns a pagination meta object; the declarative pagination config must increment `page` and stop when a page returns fewer than `per_page` records (or on the meta's total-pages value — confirm the exact `meta` shape against a live response, as the spec has no shared `Pagination` schema).

Useful shared filters worth surfacing: `external_customer_id`, `external_subscription_id`, and per-resource status filters (`subscription_status`, invoice payment status).

---

## 10. Error handling

Lago's error schemas are consistent and worth mapping precisely:

| Status | Shape                                                       | Node behaviour                                                                             |
| ------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 401    | `{status, error}`                                           | "Lago rejected the API key" — distinguish from unreachable host                            |
| 404    | `{status, error, code}` (e.g. `object_not_found`)           | Name the resource and identifier that was not found                                        |
| 422    | `{status, error, code: "validation_errors", error_details}` | **Surface `error_details` verbatim** — this is the field that makes Lago errors actionable |
| 405    | —                                                           | Usually a premium-gated or unsupported operation                                           |
| 429    | —                                                           | See below                                                                                  |

**Rate limits** (per organization, shared across API keys):

| Category        | Default      |
| --------------- | ------------ |
| `POST /events`  | 500 req/s    |
| Current usage   | 200 req/s    |
| Everything else | **50 req/s** |

Responses carry `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`. Lago documents that **retry after 429 is safe** and that event ingestion is **deduplicated by `transaction_id`** — so a replayed event is never double-billed. This makes a bounded retry-with-backoff on 429 correct-by-construction for events. Surface `X-RateLimit-Reset` in the error message.

The 50 req/s general limit matters for auto-pagination over large customer sets; keep sequential paging rather than parallel fan-out.

---

## 11. Usage-event UX proposal

The metering path is the differentiator. Proposed fields for **Event → Send**:

```
External Subscription ID   (required; resourceLocator — list from /subscriptions)
Code                       (required; resourceLocator — list from /billable_metrics)
Transaction ID             (default {{$execution.id}}-{{$itemIndex}}; dedupe key)
Timestamp                  (optional; defaults to now)
Properties                 (fixedCollection of key/value, plus a JSON toggle)
```

Two decisions that make this good rather than adequate:

1. **`Code` must be a dynamic dropdown** backed by `GET /billable_metrics` via a `listSearch` method. Typing metric codes by hand is the single biggest source of silent billing failure, and the competitor offers no such help.
2. **Auto-default `Transaction ID`** from the n8n execution + item index. Because Lago dedupes on `transaction_id`, a sensible default makes n8n retries idempotent for free. Leave it overridable.

**Batch** (`POST /events/batch`) should accept the same shape mapped over input items, so users can toggle between per-item and batched sending without rebuilding the node.

---

## 12. Plan / Billable Metric UX proposal

**Billable Metric** is genuinely straightforward — `code`, `name`, `description`, `aggregation_type`, `field_name`, `recurring`, plus expression support. Add an optional **Validate Expression** action backed by `POST /billable_metrics/evaluate_expression`; it turns an opaque failure mode into an inline check.

**Plan** is the hard one. Charges are deeply nested (`plan → charges → filters`, plus `fixed_charges`), and Lago exposes them as **independent sub-resource endpoints** (`/plans/{code}/charges`, `.../charges/{charge_code}/filters`). This is the escape hatch from the "wall of JSON" problem:

- **Plan** operations handle plan-level fields only (code, name, interval, amount, currency, trial, tax codes).
- **Plan Charge** becomes its own resource with real n8n fields for `charge_model`, `billable_metric_code`, `pay_in_advance`, `prorated`, `min_amount_cents`, and a `properties` collection whose shown fields depend on the selected charge model.
- **Charge Filters** ship in v0.2.x — they are the most complex surface and the least commonly needed.

Raw JSON stays available on the Plan resource as an "Advanced / Custom Payload" option for users replicating exotic pricing.

---

## 13. Self-hosted Docker testing strategy

Officially supported: **Docker Compose** and **Helm**. Compose is right for CI.

Practical notes for the harness:

- Lago Compose requires an **RSA private key** (`LAGO_RSA_PRIVATE_KEY`) generated at setup — the same key backing JWT webhook signatures. Generate it in the CI step; do not commit one.
- The stack is heavy: Postgres, Redis, Rails API, Sidekiq worker, scheduler, front-end, Gotenberg (PDF). **Gotenberg is required for invoice/credit-note PDF download tests.** Expect a slow cold start; gate readiness on an API health probe, not a fixed sleep.
- Pin the Lago image version in CI and record it in the audit fixture, so a Lago release cannot silently break the suite.

**Integration lifecycle** (as the handoff sketched, with the correction that customer update is an upsert):

```
docker compose up  →  wait for API ready  →  create API key
  → create customer (POST /customers)
  → create billable metric
  → create plan (+ charge)
  → create subscription
  → send events (single + batch)
  → assert current_usage reflects the events
  → finalize/refresh invoice
  → create wallet + wallet transaction
  → register webhook endpoint → assert signed delivery + signature verification
  → probe premium-gated endpoints, record matrix
  → terminate subscription, delete fixtures
  → docker compose down -v
```

Give every fixture a run-scoped code (`bsai-<runid>-...`) so parallel CI runs cannot collide on Lago's unique `code` constraints.

---

## 14. Testing expectations vs the current repo

The repository is still the **unmodified template**: `package.json` is `n8n-nodes-community-template`, and the only nodes are the `Example` and `GithubIssues` samples. Critically:

**There is no test infrastructure at all.** No test runner, no test script, and CI (`.github/workflows/ci.yml`) runs only `npm run lint` and `npm run build`. The handoff expects unit tests, integration tests, and Playwright. **All of it must be built from zero**, and the zero-runtime-dependency rule does not constrain `devDependencies`, so Vitest/Jest and Playwright are fine.

The template's `scripts/release-check.mjs` already encodes most n8n verification requirements (MIT, keyword, `n8n.strict`, zero deps, peer `n8n-workflow`, origin/`repository.url` match, required README headings). It will need one change beyond the version fix: it currently hard-checks `engines.node === ">=22.22.0"`.

---

## 15. Proposed PR roadmap

| PR  | Scope                                                                                                                                                                                                                         | Gate                      |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| 0   | Repo identity: rename to `@blackswampai/n8n-nodes-lago`, widen the `release-check.mjs` name regex for scopes, pin `rootDir`, replace README, delete the template nodes, add the `lagoApi` credential and `Lago` node scaffold | `release:check` passes    |
| 1   | **Spike:** raw-body access in n8n webhooks + `node:crypto` JWT RS256 and HMAC verification, with unit tests against fixtures                                                                                                  | De-risks the Trigger      |
| 2   | Test harness: Vitest, Docker Compose Lago, readiness probe, fixture naming, CI wiring                                                                                                                                         | Green CI with a live Lago |
| 3   | Transport: shared request helper, error mapper (401/404/422/429), pagination loop, plus test coverage for the credential shipped in PR 0                                                                                      | Credential tests pass     |
| 4   | Customer (Create-or-Update, Get, Get Many, Delete) + `listSearch`                                                                                                                                                             | Integration tests         |
| 5   | Billable Metric (CRUD + evaluate expression)                                                                                                                                                                                  | Integration tests         |
| 6   | Plan + Plan Charge                                                                                                                                                                                                            | Integration tests         |
| 7   | Subscription (Create, Get, Get Many, Update, Terminate)                                                                                                                                                                       | Integration tests         |
| 8   | **Event** (Send, Send Batch, Get, Get Many, Estimate Fees) — the flagship                                                                                                                                                     | Usage assertions          |
| 9   | Invoice (lifecycle ops, download)                                                                                                                                                                                             | Requires Gotenberg        |
| 10  | Wallet + Wallet Transaction (top-level family)                                                                                                                                                                                | Integration tests         |
| 11  | Coupon + Applied Coupon                                                                                                                                                                                                       | Integration tests         |
| 12  | Credit Note — **sequenced last, pending the premium probe**                                                                                                                                                                   | May defer to 0.2.x        |
| 13  | Webhook Endpoint resource                                                                                                                                                                                                     | Integration tests         |
| 14  | **Lago Trigger** — event selection, endpoint reuse under the 10-endpoint cap, signature verification, `X-Lago-Unique-Key` dedupe                                                                                              | End-to-end delivery test  |
| 15  | Docs, README, premium matrix, Playwright install/load test, competition re-check                                                                                                                                              | Release gate              |

**Manual smoke testing runs every two milestones** (agreed 2026-08-20), before continuing
feature work: `npm run lago:up`, then `npm run dev`, seed representative data, and exercise the
node in a real n8n editor. The first such pass, after milestone 7, found three defects the
automated suite had missed — see §19. Two of them only manifest in a production install.

---

## 16. Open questions before implementation

1. ~~Version decision~~ — **resolved**: scoped name, first release `0.1.0`.
2. ~~Claim the npm name~~ — **resolved**: the `@blackswampai` scope is already held.
3. ~~Raw body access~~ — **resolved by the PR 1 spike**, see below.
4. ~~Wallet family~~ — **resolved against a live instance**, see below.
5. ~~Pagination `meta` shape~~ — **resolved against a live instance**, see below.
6. **Premium matrix** — partially probed. Confirmed gated on the free self-hosted edition:
   `GET /api_logs` (403 `feature_unavailable`) and the `graduated_percentage` charge model
   (422 `graduated_percentage_requires_premium_license`), `PUT /invoices/{id}/refresh` (403),
   and `invoice_grace_period`, which is **silently dropped** rather than refused — meaning draft
   invoices, and therefore Finalize, cannot be exercised on the free edition. Confirmed **not**
   gated: every other charge model, invoice download, void, update and retry payment, and every
   resource shipped so far. **Credit Note is now probed**: `POST /credit_notes` and
   `POST /credit_notes/estimate` answer 403 `feature_unavailable`, while list, get, download and
   void work. The resource ships in full with the two gated operations marked, since omitting
   them would help nobody and the error now names the licence rather than the credential.

   **Silently gated fields**, which are the dangerous ones — accepted with a 200 and then
   dropped, so nothing signals the setting never applied:

   | Field                                                 | Behaviour on the free edition                               |
   | ----------------------------------------------------- | ----------------------------------------------------------- |
   | `customer.timezone`                                   | stored as null; customer stays on the organization timezone |
   | `charge.min_amount_cents`                             | stored as `0`; the spend floor never applies                |
   | `customer.billing_configuration.invoice_grace_period` | stored as null; no drafts, so Finalize is unreachable       |
   | `plan.bill_charges_monthly` on a short interval       | stored as null (a compatibility rule, not a licence one)    |

   Each is now called out in the field description, since no error will ever surface. A sweep
   for further silently-gated fields is worth repeating whenever a new resource exposes
   optional configuration.

   **Wallet recurring transaction rules crash rather than refuse.** Every shape of
   `recurring_transaction_rules` answers HTTP 500 on the free edition, with
   `NoMethodError (undefined method 'raise_if_error!' for nil)` in the API log — a genuine
   upstream bug in the premium-gated path, not a clean gate. The field is deliberately not
   exposed by the node, since a control that reliably returns 500 reads as a defect in the
   integration. Revisit if Lago fixes it, or for a premium-licensed build.

---

## 18. Live-instance findings (2026-08-20, Lago v1.51.0 self-hosted)

Verified against the disposable environment, not inferred from the specification.

### The Trigger's event vocabulary is dotted, and the OpenAPI catalogue is the wrong list

This is the most consequential finding. The audit's 61-event catalogue came from the OpenAPI
`webhooks:` section, whose keys are underscored (`invoice_created`). The `webhook_endpoints`
API **rejects that form**:

```
POST /webhook_endpoints  {"event_types":["invoice_created"]}
422  {"code":"validation_errors",
      "error_details":{"event_types":["contains invalid types: [\"invoice_created\"]"]}}
```

`invoice.created` is accepted. Lago validates against `config/webhook_event_types.yml` in
`lago-api`, which is the authoritative list: **75 events**, each with a dotted `name`, a
`description`, a `category`, and a `deprecated` flag. One (`event.error`) is deprecated.

The categories map directly onto the grouped selector the Trigger needs:

| Category               | Events |     | Category                        | Events |
| ---------------------- | ------ | --- | ------------------------------- | ------ |
| Invoices               | 13     |     | Credit Notes                    | 3      |
| Customers              | 11     |     | Features                        | 3      |
| Subscriptions and Fees | 10     |     | Plans                           | 3      |
| Quotes                 | 9      |     | Event Ingestion                 | 2      |
| Wallets and Credits    | 7      |     | Payment Receipts                | 2      |
| Payments               | 6      |     | Alerts                          | 1      |
| Billable Metrics       | 3      |     | Dunning Campaigns, Integrations | 1 each |

The Trigger should generate its event list from that YAML rather than the OpenAPI spec, and
should exclude deprecated entries.

### Pagination

```json
"meta": {"current_page":0,"next_page":null,"prev_page":null,"total_pages":0,"total_count":0}
```

`meta.next_page` is the stop condition — page until it is `null`. No `Link` header, confirming
the template's `parseLinkHeader` pattern is not reusable.

### Customer upsert confirmed

`POST /customers` with an existing `external_id` updated the record in place and returned 200.
`PUT /customers/{external_id}` returns **404** — the route does not exist. The single
Create-or-Update operation is correct.

### Wallets: two views of one resource, not two implementations

A wallet created through the top-level `POST /wallets` was immediately visible through
`GET /customers/{external_id}/wallets`. They are not competing families, so the earlier concern
was unfounded: build on top-level `/wallets` (addressed by `lago_id`) and offer the
customer-scoped path as a filter. Note that a top-level create derives `code` from `name`
(`"Top level"` became `top_level`).

### Webhook keys and signatures

`GET /webhooks/public_key` returns a **base64-encoded PEM**, confirming that the base64 branch
in `toPublicKeyPem` is the real-world path rather than a defensive guess.

`signature_algo` and `event_types` both round-trip on create exactly as the spec describes.

### Error shapes: three, not two

The error mapper needs to handle a third shape. A missing top-level wrapper key produces a
**400** with no `code` field and the message inlined:

```json
{
	"status": 400,
	"error": "BadRequest: param is missing or the value is empty or invalid: customer"
}
```

That is distinct from the documented 422 validation shape, which does carry `code` and
`error_details`, and from the 401 shape, which carries neither.

---

## 17. PR 1 spike result — raw body access (resolved)

**The Trigger's highest-risk unknown is cleared.** n8n exposes the raw request body, and no
special declaration is needed.

Verified against n8n's current source:

- `packages/cli/src/middlewares/body-parser.ts` installs `rawBodyReader` on every request,
  attaching `req.readRawBody()` and caching the result on `req.rawBody` (a `Buffer`).
- `parseBody` **already calls `readRawBody()`** before parsing, so for `application/json`
  webhooks — which is every Lago delivery — `req.rawBody` is populated by the time the node runs.
- `readRawBody()` is idempotent (`if (!req.rawBody)`), so calling it defensively is free.
- `n8n-workflow` augments `http.IncomingMessage` with `rawBody: Buffer` and
  `readRawBody(): Promise<void>`, so both are typed without a cast.

The access pattern for the Trigger is therefore:

```ts
const req = this.getRequestObject();
await req.readRawBody();
const rawBody = req.rawBody;
```

Note this differs from how `nodes-base/nodes/Webhook` handles it — that node gates on a
user-facing `rawBody` option because it surfaces the body as binary data. A signature check
needs the raw bytes unconditionally, so the Trigger should simply always read them.

**Zero-dependency verification is confirmed working.** `nodes/Lago/shared/webhookSignature.ts`
implements both algorithms against `node:crypto` alone, with 37 unit tests covering the happy
paths and the attacks that matter: replay against a different body, tampered payload, foreign
signing key, `alg: none`, HS256 forged with the public key as the shared secret, header/signature
algorithm mismatch, wrong issuer, expiry, and malformed tokens. Three deliberate mutations
(removing the body binding, the algorithm check, and the issuer check) were each caught by the
suite, confirming the tests are not vacuous.

---

---

## 19. n8n error-reporting pitfalls (found by smoke testing, 2026-08-20)

Two defects that no test caught and that local development actively hides. Both were found by
running the node in a real n8n editor and reading the error panel.

### n8n wraps the transport error before node code sees it

`httpRequestWithAuthentication` throws `new NodeApiError(node, error)` (`authentication.js`).
Reading `error.response` in a node therefore finds nothing, and Lago's `code` and
`error_details` are lost — the latter being the only part of a validation failure that names the
offending field.

Where the original survives **depends on the n8n version**: some keep it as `cause`, others drop
the cause and copy the parsed body to `context.data`. Both must be checked, at every level of
the chain, because a community node runs against whatever version the user has.

### NodeApiError discards a message it was given, but only in production

Two independent behaviours combine here:

1. `NodeApiError`'s constructor returns its argument unchanged when handed another
   `NodeApiError`, discarding the `message` and `description` options entirely.
2. Even for a fresh error, `setDescriptiveErrorMessage` **overwrites** the supplied message
   whenever the status code is one it recognises — 401, 404 and 422 among them — with generic
   wording such as "The resource you are requesting could not be found".

The first is invisible during development: the project and n8n resolve **separate copies** of
`n8n-workflow`, so the `instanceof` check misses and the re-wrap appears to work. In a real
install they share one copy and every custom error message vanishes.

The fix is to unwrap to the underlying transport error before constructing, and to **assign**
`.message` after construction rather than passing it as an option. A unit test builds the
wrapper from the same class the transport uses, which reproduces production semantics in a
single-copy environment.

### Practical notes for the remaining milestones

- Test fixtures that fabricate an error shape prove nothing about how errors surface in n8n.
  Any new error-mapping work needs a fixture built through n8n's own wrapper.
- `n8n-node dev` hot-reloads node descriptions reliably, but **not** changes to shared modules
  such as `transport.ts` or `errors.ts`. Restart the dev server after touching those, or a
  smoke test will silently exercise the previous build.

## Sources

- [Lago OpenAPI 1.51.0](https://github.com/getlago/lago-openapi) (fetched and parsed directly)
- [Lago API reference](https://docs.getlago.com/api-reference/intro) · [Rate limits](https://docs.getlago.com/api-reference/rate-limits) · [Webhook format & signature](https://docs.getlago.com/api-reference/webhooks/format---signature) · [Webhooks guide](https://docs.getlago.com/guide/webhooks) · [Pricing FAQ](https://docs.getlago.com/faq/pricing) · [Self-hosted overview](https://docs.getlago.com/guide/lago-self-hosted/overview)
- [getlago/lago](https://github.com/getlago/lago) · npm registry (`n8n-nodes-lago`, `n8n-nodes-lago-api`) · [libraries.io](https://libraries.io/npm/n8n-nodes-lago)
- [n8n submit community nodes](https://docs.n8n.io/integrations/creating-nodes/deploy/submit-community-nodes/) · [n8n nodes-base](https://github.com/n8n-io/n8n/tree/master/packages/nodes-base/nodes)
