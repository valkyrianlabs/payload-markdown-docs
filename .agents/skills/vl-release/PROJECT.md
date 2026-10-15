<!-- vl-release:generated-local -- regenerate with `vlr install-local-skill` after changing release.toml; local edits are overwritten -->
# Payload Markdown Docs: release specifics

Generated from this repository's `release.toml`. The general workflow is in `SKILL.md`;
this file says how it applies here.

## Files

| Purpose | Path |
|---|---|
| Release contract | `release.toml` |
| Staged changelog (keep current) | `.release/CHANGELOG_NEXT.md` |
| Staged release notes (keep current) | `.release/RELEASE_NOTES_NEXT.md` |
| Published release notes (do not edit) | `RELEASE_NOTES.md` |
| Published Debian changelog (do not edit) | `debian/changelog` |

## Versions

- Canonical: `VERSION`
- Kept in sync by `vlr version …`: `meson.build` (meson), `package.json` (package_json), `homebrew/Formula/pmdocs.rb` (homebrew)
- Tags: `vX.Y.Z` on branch `main`; GitHub release title: `vX.Y.Z - <title>`

## Release channels

- **Debian packages** (built by `vlr build-deb` from `debian/`, revision 1):
  - `pmdocs`: architecture `amd64`; must ship `usr/bin/pmdocs`, `usr/share/doc/pmdocs/copyright`, `usr/share/pmdocs/skills/payload-markdown-docs/codex/SKILL.md`, `usr/share/pmdocs/skills/payload-markdown-docs/claude/SKILL.md`, `usr/share/pmdocs/skills/payload-markdown/codex/SKILL.md`, `usr/share/pmdocs/skills/payload-markdown/claude/SKILL.md`, `usr/share/pmdocs/skills/payload-markdown/codex/skill.json`, `usr/share/pmdocs/skills/payload-markdown/claude/skill.json`; must never ship `usr/share/pmdocs/skills/*/node_modules/*`, `usr/share/pmdocs/skills/*/__pycache__/*`; ships byte-identical copies of `skills/payload-markdown-docs/codex/SKILL.md`, `skills/payload-markdown-docs/claude/SKILL.md`, `skills/payload-markdown/codex/SKILL.md`, `skills/payload-markdown/claude/SKILL.md`, `skills/payload-markdown/codex/skill.json`, `skills/payload-markdown/claude/skill.json`
- **APT**: https://apt.valkyrianlabs.com (suite `stable`, components main), published by release CI with `vlr publish-deb`
- **npm package** (built by `vlr build-npm`): packed with `npm` from `.`, dist-tag `latest`, pre-pack: `pnpm build`, also published as `payload-markdown-docs` (`[[npm.aliases]]`, derived from the same tarball)
  - registry `npmjs`: https://registry.npmjs.org/ (auth `oidc`), published with `vlr publish-npm`
- **Source archive** of the prepared tree, attached to the GitHub release
- **Homebrew**: formula template `homebrew/Formula/pmdocs.rb`, published to `valkyrianlabs/homebrew-tap` as `Formula/pmdocs.rb`

## Before considering substantial work complete

```sh
vlr check
pnpm test:int
```
