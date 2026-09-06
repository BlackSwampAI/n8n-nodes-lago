# Lago API matrix

The integration targets Lago's public v1 API. Existing unit and guarded Docker integration suites
freeze methods, paths, bodies, list envelopes, errors, and edition differences.

| Resource                    | Operations                                                                     |
| --------------------------- | ------------------------------------------------------------------------------ |
| Billable Metric             | Create, Get, Get Many, Update, Delete, Evaluate Expression                     |
| Coupon                      | CRUD, apply/list/remove customer coupons                                       |
| Credit Note                 | Create, Estimate, Get, Get Many, Download, Void                                |
| Customer                    | Create or Update, Get, Get Many, Delete                                        |
| Event                       | Send, Send Batch, Get, Get Many, Estimate Fees                                 |
| Invoice                     | Create One-Off, Get, Get Many, Update, Finalize, Void, Download, Retry Payment |
| Plan / Plan Charge          | CRUD                                                                           |
| Subscription                | Create, Get, Get Many, Update, Terminate                                       |
| Wallet / Wallet Transaction | Wallet lifecycle and transactions                                              |
| Webhook Endpoint            | CRUD                                                                           |
| Lago Trigger                | Signed billing-event delivery                                                  |

The pinned self-hosted fixture is authoritative for the tested free-edition behavior. Premium
operations are clearly marked and Cloud-specific behavior remains limited to non-destructive
compatibility evidence already recorded in repository tests/docs.
