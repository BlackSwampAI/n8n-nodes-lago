# Contributing

## Prerequisites

- Node.js 22.22.0 or later
- Docker and Docker Compose, for the integration environment

```sh
npm install
```

## Everyday commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start n8n with this node loaded and hot reload enabled |
| `npm run build` | Compile to `dist/` |
| `npm run lint` / `npm run lint:fix` | n8n's community-node lint rules |
| `npm test` / `npm run test:watch` | Run the test suite |
| `npm run lago:up` / `npm run lago:down` | Start or destroy the disposable Lago instance |
| `npm run release:check` | Audit the package against n8n's verification requirements |

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

This destroys the containers *and the database volume*, so every run starts from a clean
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

## Conventions

Branches are `<type>/<kebab-slug>`. Commits and pull request titles follow Conventional
Commits — `feat:`, `fix:`, `chore:`, `docs:` — with the subject in lowercase and the body
explaining *why*.

Before opening a pull request:

```sh
npm run lint && npm test && npm run build && npm run release:check
```
