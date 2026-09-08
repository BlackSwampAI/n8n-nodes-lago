# Branding provenance

This is an independent community integration and is not affiliated with, endorsed by, sponsored
by, or maintained by Lago. Product names and marks belong to their respective owners and are used
only to identify compatibility.

Accessed 2026-09-06. `icons/lago.svg` is byte-for-byte identical to the official
`getlago/lago-front` `public/favicon-prod.svg` at commit
`74afcf73113dffc6ba2e698d046fb12bb14cc2a1`; SHA-256
`efb73b97ce2baa9cb151f49e1ecc07b6004081cdf8414b7586a0da234c0b5b4a`.

`icons/lago.dark.svg` uses the same official geometry with an inverted light canvas for dark n8n
UI; SHA-256 `4ac719470ca6de5a2c500b951e5959b707ea7de4ed97cfdd2c4450b9a67154e1`.
Both variants must resolve from the built action node, trigger, and credential, remain in the npm
tarball, and be inspected on contrasting backgrounds. Creator Portal presentation is a separate
human qualification gate.

The Lago-specific package check verifies these SHA-256 values for both source and built icon
files and requires both variants in the packed tarball. Before release, inspect the variants on
contrasting backgrounds and record the Creator Portal card version and logo separately.
