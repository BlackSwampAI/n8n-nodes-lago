---
name: Release
about: Track a provenance-backed npm release
title: 'Release vX.Y.Z'
labels: release
assignees: ''
---

- [ ] Package version and CHANGELOG entry are final
- [ ] Repository is public and CI is green on the release commit
- [ ] Format, lint, typecheck, Vitest, build, source scan, release audit, package check, load smoke, and packed-install smoke pass
- [ ] Docker integration passes only against an explicitly marked disposable loopback Lago environment
- [ ] Light and dark icons render on contrasting backgrounds; provenance, hash, and tarball presence are confirmed
- [ ] Annotated `vX.Y.Z` tag exactly matches `package.json` and points to the reviewed commit
- [ ] Tag-only Trusted Publisher workflow succeeds with npm provenance
- [ ] Published scanner prints the exact success result (do not trust exit code alone)
- [ ] Creator Portal is submitted for the exact published version and its card version/logo are visually verified
