# Template migrations

GitHub creates a new repository from a snapshot of this template. Generated repositories do not inherit later template changes automatically.

The current reusable baseline and canonical source repository are recorded in `.blackswamp/template.json`. Keep that file after generation so maintainers can compare their adopted version with future template releases. Updating the marker alone is not a migration: review the template diff, adopt each relevant script, workflow, test, or documentation change, run every local gate, and then update the marker in the generated repository.

## 2.1.0

Adopted by this generated Lago repository on 2026-09-08.

- Made declarative routing the required starting point for ordinary REST API nodes, including an explicit evaluation of routing, expressions, pagination, `preSend`, and `postReceive`.
- Required a concrete, recorded exception before using programmatic execution; generic "weird JSON" is not sufficient justification.
- Removed the programmatic Example fixture and made GitHub Issues the sole registered, canonical declarative example.
- Added implementation-style evidence to the API matrix and builder handoff templates.
- Split testing guidance between declarative routing contracts and programmatic responsibilities such as input immutability and paired-item lineage.

Generated repositories adopting this migration should classify each existing operation in their API matrix. Convert ordinary REST operations when contract tests show declarative parity; retain programmatic implementations only where the documented exception remains necessary. Run the full validation suite before updating `.blackswamp/template.json` to `2.1.0`.

## 2.0.1

- Split immutable npm publication from post-publication registry/provenance verification. A failed verifier can now be rerun without attempting to republish an existing version.
- Added the exact transient provenance source-repository 404 to the bounded scanner propagation policy; 403, rate-limit, timeout, policy, lint, and unrelated failures still fail immediately.
- Replaced the sparse README starter with a canonical Black Swamp AI structure and explicit verified, manual Community Nodes, and private/unavailable distribution choices.
- Clarified that npm tarball icons, the npm homepage/README, and n8n Creator Portal cards are separately validated surfaces.
- Documented the Node 22/24 migration trap: do not carry forward `.npmrc` `engine-strict=true` with a package engine that excludes either CI lane.
- Require new migration branches to start from the current post-squash `main`, not the pre-merge feature history.

## 2.0.0

- Added official n8n source and built-output scanner preflight.
- Added explicit-success post-publication scanning with bounded propagation handling.
- Added token-bootstrap/OIDC npm-auth preparation and npm version verification.
- Added generic compiled-registration and isolated packed-install smoke tests.
- Added reusable API, testing, branding, operation-contract, PR, and batch-handoff guidance.
