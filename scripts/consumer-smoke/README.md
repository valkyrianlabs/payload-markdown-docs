# Consumer smoke test

Installs packed `@valkyrianlabs/payload-markdown` and `@valkyrianlabs/payload-markdown-docs`
tarballs into a fresh Next.js + Payload app (`template/`) exactly as the README instructs, then
checks what unit tests cannot:

1. one copy of `payload-markdown` and of `@payloadcms/ui` is installed
2. every admin import-map specifier resolves from the app root
3. `next build` succeeds (the template intentionally has no `media` collection)
4. `pmdocs push` syncs `template/docs` with a docs-set-scoped Ed25519 key, and the pages render
   through the real core renderer using the app's own `payloadMarkdown()` options, with core CSS

```bash
pnpm build && npm pack --ignore-scripts --pack-destination /tmp/pmd
(cd ../payload-markdown && pnpm build && npm pack --ignore-scripts --pack-destination /tmp/pmd)
node scripts/consumer-smoke/run.mjs \
  --core /tmp/pmd/valkyrianlabs-payload-markdown-<version>.tgz \
  --docs /tmp/pmd/valkyrianlabs-payload-markdown-docs-<version>.tgz \
  --pmdocs ./build-native/cli/pmdocs
```

Dependency versions default to the ones installed in this repository's `node_modules`
(override with `--version:<package> <version>`). Set `PNPM="corepack pnpm"` if `pnpm` is not on
`PATH`. Results are written to `<workdir>/smoke-results.json`; the work directory is removed on
success unless `--keep` is passed.
