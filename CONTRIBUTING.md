# Contributing

## Prerequisites

- Node.js 22.22.0 or later
- Docker and Docker Compose, for the integration environment

```sh
npm install
```

## Everyday commands

| Command                                 | What it does                                              |
| --------------------------------------- | --------------------------------------------------------- |
| `npm run dev`                           | Start n8n with this node loaded and hot reload enabled    |
| `npm run build`                         | Compile to `dist/`                                        |
| `npm run lint` / `npm run lint:fix`     | n8n's community-node lint rules                           |
| `npm run typecheck`                     | Typecheck sources and tests together                      |
| `npm test`                              | Run every test                                            |
| `npm run test:unit`                     | Unit tests only, no Docker needed                         |
| `npm run test:integration`              | Integration tests against a live Lago                     |
| `npm run lago:up` / `npm run lago:down` | Start or destroy the disposable Lago instance             |
| `npm run release:check`                 | Audit the package against n8n's verification requirements |

## The disposable Lago environment

Integration tests run against a real Lago instance rather than mocked HTTP, because most of
what is worth testing here is Lago's actual billing behaviour.

```sh
npm run lago:up
```

This starts Postgres, Redis, the Lago API and a Sidekiq worker, seeds an organization, and
writes the connection details to `.env.test`. First run pulls several images and takes a few
minutes; later runs are fast. The API is published on **port 3210** so it cannot collide with
anything already using Lago's default 3000.

```sh
npm run lago:down
```

This destroys the containers _and the database volume_, so every run starts from a clean
billing history. That matters more than usual here: invoices, sequential numbering and usage
aggregation all accumulate, and a dirty database makes tests pass or fail depending on what
ran before them.

### How the credential is created

Lago normally requires an interactive signup before any API key exists. Its migration script
can seed an organization instead, and adopts a caller-supplied key verbatim when
`LAGO_ORG_API_KEY` is set, so the test credential is known up front. `scripts/lago-dev.mjs`
verifies the seeded key against the REST API before declaring the environment ready — a
healthy container only proves Rails booted, not that the seeding step ran.

### Notes on the stack

- **PDF generation is disabled.** It needs a separate Gotenberg service, which is left out
  until invoice and credit-note download operations land.
- **The worker matters.** Billing, invoice generation and webhook delivery are asynchronous,
  so without Sidekiq the REST calls succeed but nothing is ever produced.
- **The image tag is pinned** to the Lago version the node was built against, so an upstream
  release cannot silently change behaviour under the suite.

## Test layout

```
test/unit/          no network, no containers
test/integration/   drives a real Lago instance
test/support/       shared helpers, in JavaScript (see below)
```

Integration tests **skip rather than fail** when no Lago is configured, so contributors
without Docker can still run `npm test` and get a meaningful result.

### Why test/support is JavaScript

The n8n community-node lint rules apply to every `.ts` file in the package and cannot be
scoped to `nodes/` and `credentials/` while `n8n.strict` is on. Reading environment variables
and the filesystem from a `.ts` test would trip them. Keeping that access in `.mjs` modules
lets everything else stay TypeScript. `vitest.config.mjs` is JavaScript for the same reason.

## Conventions

Branches are `<type>/<kebab-slug>`. Commits and pull request titles follow Conventional
Commits — `feat:`, `fix:`, `chore:`, `docs:` — with the subject in lowercase and the body
explaining _why_.

Before opening a pull request:

```sh
npm run lint && npm run typecheck && npm test && npm run build && npm run release:check
```
