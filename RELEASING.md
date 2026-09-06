# Releasing the Lago community node

Publish only from `.github/workflows/publish.yml`; never publish locally. This established package
uses npm Trusted Publisher/OIDC and must not retain an `NPM_TOKEN` secret.

Before tagging, run the format, lint, strict typecheck, unit, build, scanner, release, package,
compiled-load, isolated-install, and guarded Docker integration gates. Confirm CI is green on the
exact commit. Create an annotated `v<version>` tag only when it exactly matches `package.json`.

After `publish` succeeds, the separate dependent `verify-published` job runs the official scanner. If only that job fails, GitHub Actions **Re-run failed jobs** safely reruns verification without invoking `npm run release`; never rerun the successful publish job for an immutable version. Require the official scanner's explicit
`Package <exact-spec> has passed all security checks` text; its exit status alone is insufficient.
The wrapper retries only bounded, recognized registry/provenance propagation failures, including
the brief public-source 404 observed immediately after publication; deterministic findings fail
immediately.
Verify npm latest/provenance and the GitHub release. If submitted to n8n, separately inspect the
Creator Portal card version and logo. Versions and published tags are immutable.
