# Builder batch handoff

Use this checklist for each bounded implementation batch. Copy it into the batch record and fill every field with concrete repository evidence.

## Scope

- Goal: one independently reviewable outcome.
- Allowed files: an explicit allowlist recorded in the assignment.
- Non-goals: operations, dependencies, architecture, and external actions excluded by the assignment.
- Escalate before: dependencies, public API changes, architecture changes, release actions, or scope expansion.
- Implementation style: declarative by default, with each programmatic exception documented.
- Style evidence: record routing, expressions, pagination, `preSend`, and `postReceive` used, or the concrete requirement they cannot safely express.

## Evidence and tests

- Compare generated API contracts, current human documentation, and pinned live behavior when an external API is involved.
- Test real n8n parameter shapes, including expression values and resource-locator list objects.
- Ensure required controls are visible and marked required for every advertised operation.
- For ordinary REST APIs, prove declarative request construction, pagination, hooks, response normalization, and item-per-input behavior as applicable.
- For a programmatic exception, prove the documented exceptional behavior plus input immutability, paired items, request-helper use, and `continueOnFail` handling as applicable.
- Prove invalid blank/default state fails locally before transport when it cannot form a valid request.
- Add a harmless credential test where supported and assert intended nodes reference the credential.
- Use exact, run-owned live fixtures with fail-closed target guards and cleanup assertions. Never sweep by prefix.

## Handoff

- Summary and files changed
- Contract/runtime discrepancies
- Implementation-style decision, evidence, and rejected declarative options for any programmatic exception
- Commands and exact results
- Package or UI smoke evidence, clearly distinguished from metadata inference
- Cleanup status, limitations, risks, and decisions still needed
- `git diff --check` and allowed-file review result
