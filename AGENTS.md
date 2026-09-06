# Orchestrator and builder workflow

- The human and primary agent are co-orchestrators; exactly one Galileo builder implements bounded work.
- The builder uses `gpt-5.6-sol` with low reasoning and does not delegate recursively.
- Preserve unrelated changes. Escalate dependencies, architecture, public API, or release strategy changes.
- Tests are strict `*.test.ts` Vitest files; `.mjs` is reserved for direct operational tooling.
- Run repository gates before handoff. Release actions require explicit user authorization and `RELEASING.md`.
