---
title: MCP Agent Tools
navTitle: MCP
description: Let AI agents manage Git-backed docs through @payloadcms/plugin-mcp without overwriting synced content.
order: 350
status: published
tags:
  - agents
  - mcp
  - workflow
---

# MCP Agent Tools

`payload-markdown-docs/mcp` connects the docs plugin to Payload's
official MCP plugin, `@payloadcms/plugin-mcp`. AI agents (Claude, Codex, Cursor and
other MCP clients) can then manage the docs site: presentation fields, publishing,
version rollbacks, docs sets and groups, sync access and the sync history.

Agents cannot overwrite synced content. Git stays the source of truth for every doc
body and its frontmatter fields; to change those, edit the Markdown in the repository
and sync.

:::toc {title="On this page" depth="2" theme="compact"}
:::

## Setup

Install the MCP plugin next to the docs plugin:

```bash
pnpm add @payloadcms/plugin-mcp
```

Wrap the `mcpPlugin` options with `withPayloadMarkdownDocsMcp()`. When the app also
uses payload-markdown's MCP tools, chain both wrappers; the order does not matter:

```ts
import { mcpPlugin } from '@payloadcms/plugin-mcp'
import { payloadMarkdown } from 'payload-markdown'
import { withPayloadMarkdownMcp } from 'payload-markdown/mcp'
import { payloadMarkdownDocs } from 'payload-markdown-docs'
import { withPayloadMarkdownDocsMcp } from 'payload-markdown-docs/mcp'

export default buildConfig({
  admin: { user: 'users' },
  collections: [
    // Explicit: the MCP API key collection is also an auth collection, so Payload
    // no longer adds its default users collection.
    { slug: 'users', auth: true, fields: [] },
    Pages,
  ],
  plugins: [
    payloadMarkdown({ collections: { pages: true } }),
    payloadMarkdownDocs({ target: { enableDrafts: true } }),
    mcpPlugin(
      withPayloadMarkdownMcp(
        withPayloadMarkdownDocsMcp({
          collections: { pages: { enabled: true } },
        }),
      ),
    ),
  ],
})
```

The docs package never imports payload-markdown, so it works whether the app installed
`payload-markdown` or `payload-markdown`.

Then create a key in the admin under **MCP → API Keys**, tick what the agent may do, and
point the client at `/api/mcp` with `Authorization: Bearer <key>`.

Enable `target.enableDrafts` to get drafts, publishing and a version history for
generated docs. Without it, doc changes are live and there are no versions to restore.

## What Git Owns

| Collection | Git-owned (refused for agents) | Agent-editable |
| --- | --- | --- |
| Docs | `content` (the markdown field), `title`, `navTitle`, `description`, `order`, `dependencies`, `route`, `sourcePath`, `sourceHash`, `depth`, `docsSet`, `sync` | `heroImage`, `overrides.navTitle`, `overrides.hideFromNav`, `parent`, `publishedAt`, fields other plugins add, publish status |
| Docs sets | `sync` (last sync status) | everything else: title, description, SEO, group, routing, branch, repositories, workflow refs |
| Docs groups | nothing | everything |
| Access | nothing | everything (public keys only) |
| Assets, sync runs, nonces | everything | nothing |

Generated docs are created, archived and deleted by sync only. Use
`overrides.navTitle` to change a sidebar label without touching the frontmatter.

## How Content Stays Protected

Three layers, so no single misconfiguration opens a path:

1. **Built-in tools.** `withPayloadMarkdownDocsMcp()` keeps plugin-mcp's create, update
   and delete tools off Git-owned collections (`updateDocs` is never registered, even
   when a key has the docs **Update** checkbox). Read tools stay available.
2. **payload-markdown's tools.** The same masking makes `markdownWrite` and
   `markdownPublish` refuse the docs collection with `forbidden`, in either wrapper
   order. `markdownRead` and `markdownValidate` still work on docs.
3. **Payload guard.** The docs plugin installs a `beforeChange` / `beforeDelete` guard
   on its collections. Any write from an MCP request (`payloadAPI: 'MCP'`) that changes
   a Git-owned field is rejected with a 403 `sync_owned` error, whatever tool or access
   mode issued it. The sync endpoint, the admin UI and REST or GraphQL clients are not
   affected.

The only exception is `docsRestoreVersion`, which may restore Git-owned fields, and only
from versions that are exact Git snapshots.

## Tools

| Tool | Does |
| --- | --- |
| `docsGuide` | Start here: collections, Git-owned and editable fields, drafts, and what this key may do. |
| `docsStructure` | Docs groups and docs sets with routing, SEO, publishing security, last sync status and doc counts. |
| `docsFind` | Finds docs by docs set, route, source path or title, with sync drift and editable fields. |
| `docsUpdate` | Changes admin-owned fields of one doc. Saves a draft unless `publish: true`. |
| `docsPublish` | Publishes the latest draft, or unpublishes, a doc or docs set. |
| `docsVersions` | Lists versions (with `gitSnapshot`) or inspects one version and the fields it changes. |
| `docsRestoreVersion` | Rolls a doc or docs set back. Docs versions must be Git snapshots. Draft unless `publish: true`. |
| `docsSetSave` | Creates or updates a docs set. |
| `docsGroupSave` | Creates or updates a docs group. |
| `docsAccessList` | Lists sync credentials (Ed25519 keys, GitHub OIDC owners). |
| `docsAccessSave` | Creates or updates a sync credential. Private keys are refused. |
| `docsAccessDelete` | Deletes a sync credential. |
| `docsSyncRuns` | The sync audit log, or one run with its plan summary, warnings and errors. |

The `docsManage` prompt packages the workflow for clients that show prompts as slash
commands.

Write tools take `ifUpdatedAt` (the `updatedAt` from the last read) and refuse the write
with `conflict` when the record changed since. `dryRun` validates without saving.

`docsFind` reports `sync.contentDrift` and `sync.fieldsDrift` for docs edited outside
Git. The next sync reports a manual-edit conflict for those docs until the edit is
reverted, for example by restoring a version with `gitSnapshot: true`.

## API Key Permissions

With the default `access: 'mcpApiKey'`, a tool runs only when the key allows it twice:

- the tool's own checkbox (plugin-mcp lists every custom tool on the key), and
- the per-collection checkbox for the operation: **Find** for reads, **Create**,
  **Update** or **Delete** for writes.

`withPayloadMarkdownDocsMcp()` exposes the plugin collections so keys get these
checkboxes:

| Collection | Checkboxes |
| --- | --- |
| `docs` | Find, Update (Update enables `docsUpdate`, `docsPublish`, `docsRestoreVersion`) |
| `docs-sets` | Find, Create, Update |
| `docs-groups` | Find, Create, Update, Delete |
| `docs-access` | Find, Create, Update, Delete |
| `docs-sync-runs` | Find |
| `payload-markdown-docs-assets` | Find |

Collections you configure yourself in `mcpPlugin({ collections })` are kept, narrowed to
those operations for Git-owned collections. Every tool also runs as the key's user with
`overrideAccess: false`, so the plugin's access rules apply.

## Options

`withPayloadMarkdownDocsMcp(mcpOptions, options?)`:

| Option | Default | Notes |
| --- | --- | --- |
| `access` | `mcpApiKey` | `user` relies on Payload access control only. |
| `tools` | all | Any of `guide`, `structure`, `find`, `update`, `publish`, `versions`, `restore`, `saveSet`, `saveGroup`, `access`, `saveAccess`, `deleteAccess`, `syncRuns`. `PAYLOAD_MARKDOWN_DOCS_MCP_READ_ONLY_TOOLS` is the read-only set. |
| `prompts` | `true` | Register `docsManage`. |
| `exposeCollections` | `true` | Add the plugin collections to `mcpPlugin({ collections })`. |
| `collections` | plugin defaults | Slugs when `payloadMarkdownDocs()` uses custom ones, for example `{ docs: 'guides' }`. A mismatch is logged on the first MCP request. |

Existing `mcp.tools`, `mcp.prompts` and `overrideAuth` are kept. Applying the wrapper
twice, or registering a tool with one of its names, throws at config time.

## Errors

Results are JSON text. Failures set the MCP `isError` flag and return
`{ "error": "<code>", "message": "…" }`:

| Code | Meaning |
| --- | --- |
| `sync_owned` | The change touches a field Git owns. `details.fields` lists them. Edit Git instead. |
| `not_git_snapshot` | The version was edited outside Git, so it cannot be restored. |
| `forbidden` | No user, or the key lacks the tool's collection checkbox. |
| `conflict` | `ifUpdatedAt` did not match: read again. |
| `locked` | Someone has the record open; retry with `overrideLock` only if the user agrees. |
| `no_drafts` / `no_versions` | The collection has no drafts or version history. |
| `invalid_input` | Unknown field, malformed value, or a private key. |
| `not_found` / `not_enabled` | Unknown record, or the collection is not installed. |

## Custom Agents

The operations are exported as plain functions for agents that do not use MCP:
`findDocs`, `updateDocsRecord`, `setPublishStatus`, `listVersions`, `readVersion`,
`restoreVersion`, `getDocsStructure`, `saveDocsSet`, `saveDocsGroup`, `listDocsAccess`,
`saveDocsAccess`, `deleteDocsAccess`, `findSyncRuns` and `getDocsGuide`. They take
`{ req }` with a Payload user and default to `access: 'user'`.
