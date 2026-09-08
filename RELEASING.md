# Releasing the Lago community node

This repository publishes only from `.github/workflows/publish.yml`. Never run `npm publish` locally for a version intended for n8n verification. npm versions and published tags are immutable.

## Release gate

From a clean release commit, run:

```sh
npm ci
npm run format:check
npm run lint
npm run typecheck
npm run test:unit
npm run build
npm run scan:source
npm run package:check
npm run smoke:load
npm run smoke:install
git diff --check
```

Run the guarded Lago integration suite against its pinned disposable Docker stack and inspect representative credentials, operations, outputs, errors, and trigger activation in a disposable n8n instance. Confirm the packed light/dark icons and record the Creator Portal card version and logo separately.

## Publishing 0.1.3

1. Confirm `package.json`, `package-lock.json`, and `CHANGELOG.md` all identify 0.1.3.
2. Confirm CI is green on the exact release commit on `main`.
3. Confirm npm Trusted Publisher points to `BlackSwampAI/n8n-nodes-lago` and `.github/workflows/publish.yml`, leaves Environment blank because the workflow declares none, and has Allowed actions explicitly including direct `npm publish`. This established package must not retain an `NPM_TOKEN` secret.
4. Create and push the annotated tag `v0.1.3` pointing to that commit.
5. Let the immutable `publish` job publish once. Do not rerun it after a successful npm publication.
6. Let the fresh read-only `verify-published` job scan `@blackswampai/n8n-nodes-lago@0.1.3`. If only verification fails because registry or provenance data is still propagating, rerun only the failed verifier.
7. Verify npm `latest`, provenance attestations, and the matching GitHub release, then inspect the Creator Portal card.

Future releases follow the same process with one new, matching version in the manifest, lockfile, changelog, annotated tag, npm package, and GitHub release. Never move a published tag or reuse a version.
