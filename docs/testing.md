# Testing

Strict TypeScript Vitest unit tests cover operation metadata, request construction, pagination,
validation, trigger signatures/lifecycle, and errors. Destructive integration tests run only
against the pinned disposable Docker Lago environment and must fail closed otherwise.

Release validation adds Node 22.22 and 24 CI, official source/built scanner preflight, a dry-run
package allowlist, compiled registration/credential/icon loading, and isolated packed install.
Registry provenance scanning runs only after publication and must print explicit success.
Registry metadata and provenance source can briefly return 404 immediately after publication.
The wrapper retries only bounded, recognized propagation messages—including the exact public-source
404 observed after a successful provenance-backed publish—and fails deterministic findings immediately.
