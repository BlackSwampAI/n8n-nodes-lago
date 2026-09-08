# Lago testing strategy

## Test tiers

Strict TypeScript unit tests under `test/unit/` cover each advertised resource, transport and error helpers, webhook signatures, package registration, node wiring, packed icons, disposable-target guarding, and release tooling. `npm run test:unit` runs that directory without starting Lago.

The guarded suites under `test/integration/` use the pinned disposable Docker Compose Lago environment. They cover the credential, transport, every resource family, and trigger lifecycle. They remain a separate `npm run test:integration` gate so a Docker/Lago failure is distinguishable from package verification.

For local live testing, run `npm run lago:up`, then `npm run test:integration`, and finally
`npm run lago:down`. The generated `.env.test` includes the explicit disposable marker; the
test loader reads each value from the process environment first and falls back to that file.

## Final implementation-style exception

The Lago action node intentionally remains programmatic. n8n does not combine a node's `execute()` engine with declarative operation routing: `execute()` is the active path and would bypass routing metadata. The node therefore exposes `execute()` and no `requestDefaults` or property/option `routing` metadata; `nodeWiring.test.ts` enforces that real-description contract.

The current engine is retained because its shared transport maps Lago-specific 401, edition-sensitive 403, resource-aware 404, validation 422, malformed-base-URL, and network failures into useful node errors. Invoice and credit-note Download also conditionally follow an empty asynchronous-render POST with a GET. The per-input router centralizes output normalization, paired-item lineage, deterministic input ordering, and Continue On Fail. A declarative rewrite would need contract parity for all of those behaviors and is not warranted solely to remove inactive metadata.

The Lago Trigger is independently programmatic because activation discovers or creates the remote webhook, records ownership, optionally fetches the JWT public key, verifies JWT/HMAC deliveries, deduplicates retry keys in bounded workflow static data, and deletes only an owned endpoint during deactivation.

## Evidence by responsibility

| Responsibility                                        | Existing evidence                                                                                                                                                                                           | Current gap                                                                                   |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Authenticated request helper                          | `transport.test.ts` contexts expose only `httpRequestWithAuthentication`; all request tests and live integration pass through `lagoApiRequest`                                                              | No representative real-n8n editor trace is stored in the repository                           |
| Pagination and limits                                 | `transport.test.ts` covers multi-page traversal, limits, page-size ceiling, empty pages, repeated cursors, and nonsequential cursors; resource suites cover list query shapes                               | Integration coverage is representative rather than exhaustive across every filter combination |
| Deterministic multiple inputs and paired-item lineage | `nodeWiring.test.ts` isolates the real router with multiple frozen inputs, a multi-record result, exact output order, and pairing; customer integration also asserts pairing                                | Coverage is centralized at the shared router rather than repeated for every handler           |
| Continue On Fail                                      | `nodeWiring.test.ts` proves paired per-item error output and continued processing when enabled, plus fail-fast behavior and no later calls when disabled; customer integration covers a live representative | Coverage is centralized at the shared router rather than repeated for every handler           |
| Useful/redacted errors                                | `transport.test.ts` and `errors.test.ts` cover wrapped 404, 422 details, malformed URLs, 401/403/404/422/network mapping, and junk input                                                                    | No exhaustive corpus proves credential redaction for every upstream or runtime error shape    |
| Input immutability                                    | `nodeWiring.test.ts` passes deeply frozen input JSON through the real router and verifies it remains unchanged                                                                                              | The shared-router contract is covered, but every handler is not independently mutation-tested |
| Conditional downloads                                 | Invoice and credit-note unit/integration suites cover download behavior; handlers explicitly perform follow-up GET after an empty POST                                                                      | Timing behavior can still vary by Lago deployment                                             |
| Trigger lifecycle and signatures                      | `lagoTrigger.test.ts`, `webhookSignature.test.ts`, and guarded trigger integration cover metadata, cryptography, activation/deactivation, and delivery behavior                                             | No real-n8n editor activation artifact is stored                                              |

These gaps are documented rather than converted into release claims. Future work should prioritize a disposable real-n8n editor smoke and broader credential-redaction fuzzing.

On 2026-09-08, `npm run test:integration` passed 14 files and 169 tests against the pinned disposable Lago v1.51.0 stack. `npm run lago:down` then removed the test containers, network, volume, and generated `.env.lago` and `.env.test` files.

## Required local gates

```sh
npm run format:check
npm run lint
npm run typecheck
npm run test:unit
npm run build
npm run scan:source
npm run package:check
npm run smoke:load
npm run smoke:install
```

Run `npm run test:integration` only with the pinned disposable Lago stack available. Before publishing, also inspect credential entry, node discovery, representative fields, execution, and trigger activation in disposable n8n. Package metadata and compiled-load checks are not evidence of editor behavior.
