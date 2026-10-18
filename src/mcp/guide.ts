import type { PayloadRequest } from 'payload'

import type { DocsCollectionRole } from '../payload/agentGuard.js'
import type { DocsAgentAccessMode, DocsAgentOperation } from './access.js'
import type { DocsCollectionInfo } from './collections.js'

import { hasDocsAgentAccess } from './access.js'
import { editableFieldNames, getDocsCollections } from './collections.js'

const DESCRIPTIONS: Record<DocsCollectionRole, string> = {
  docs: 'generated docs pages, one per Markdown file in Git',
  docsAccess: 'credentials allowed to sync docs (Ed25519 public keys, trusted GitHub owners)',
  docsAssets: 'synced skill files, llms files and static assets',
  docsGroups: 'navigation groups that docs sets belong to',
  docsSets: 'one per Git docs source; the slug is the `pmdocs --source` id',
  nonces: 'sync replay protection',
  syncRuns: 'sync audit log',
}

const ORDER: DocsCollectionRole[] = ['docsGroups', 'docsSets', 'docs', 'docsAccess', 'syncRuns', 'docsAssets', 'nonces']

const OPERATIONS: Record<DocsCollectionRole, DocsAgentOperation[]> = {
  docs: ['find', 'update'],
  docsAccess: ['find', 'create', 'update', 'delete'],
  docsAssets: ['find'],
  docsGroups: ['find', 'create', 'update'],
  docsSets: ['find', 'create', 'update'],
  nonces: [],
  syncRuns: ['find'],
}

const code = (values: string[]): string => values.map((value) => `\`${value}\``).join(', ')

const describeCollection = (
  req: PayloadRequest,
  collection: DocsCollectionInfo,
  access: DocsAgentAccessMode,
): string => {
  const owned = collection.policy?.syncOwnedFields
  const flags = [
    collection.drafts ? 'drafts' : collection.role === 'docs' ? 'no drafts: changes are live' : undefined,
    collection.markdownField ? `markdown field \`${collection.markdownField}\`` : undefined,
  ].filter(Boolean)
  const allowed = OPERATIONS[collection.role].filter((operation) =>
    hasDocsAgentAccess(req, collection.slug, operation, access),
  )
  const lines = [
    `- \`${collection.slug}\` (${[DESCRIPTIONS[collection.role], ...flags].join('; ')}). This connection may: ${allowed.length ? allowed.join(', ') : 'nothing'}.`,
  ]

  if (owned === '*') {
    lines.push('  - Written by Git sync only; read-only for agents.')
  } else if (owned?.length) {
    lines.push(`  - Git-owned (refused): ${code(owned)}.`)
    lines.push(`  - Agent-editable: ${code(editableFieldNames(collection)) || '(none)'}.`)
  } else if (collection.role !== 'nonces') {
    lines.push(`  - Agent-editable: ${code(editableFieldNames(collection)) || '(none)'}.`)
  }

  return lines.join('\n')
}

export type DocsGuideOptions = {
  access?: DocsAgentAccessMode
  req: PayloadRequest
}

/** The agent guide for this site's docs plugin, generated from the live config. */
export const getDocsGuide = ({ access = 'user', req }: DocsGuideOptions): string => {
  const collections = getDocsCollections(req.payload)
  const installed = ORDER.flatMap((role) => (collections[role] ? [collections[role]] : []))
  const docs = collections.docs

  return [
    '# payload-markdown-docs agent guide',
    '',
    'This site publishes documentation from Git. The `pmdocs` CLI (or CI) syncs Markdown files into Payload; Git is the source of truth for every doc body and its frontmatter fields (title, navTitle, description, order, route, dependencies), and for each docs set\'s technology stack (`docs/stack.toml`, which also supplies the docs set title and description unless "Manually manage title/desc" is on).',
    '',
    '## What agents can and cannot do',
    '',
    '- Doc content and frontmatter cannot be changed over MCP. To change them, edit the Markdown files in the Git repository, run `pmdocs validate --source <docs-set-slug>`, and let the sync (CI or `pmdocs push`) update the site. The plugin refuses these writes from every MCP tool (`sync_owned`), including the built-in collection tools and payload-markdown\'s `markdownWrite`.',
    '- Generated docs are created, archived and deleted by sync only.',
    '- Agents can: change admin-owned presentation fields of a doc (hero image, nav overrides, parent, publishedAt) with `docsUpdate`; publish or unpublish with `docsPublish`; inspect versions and roll back to a version Git produced with `docsVersions` / `docsRestoreVersion`; manage docs sets and groups (titles, descriptions, SEO, routing, publishing security) with `docsSetSave` / `docsGroupSave`; manage sync credentials with `docsAccessList` / `docsAccessSave` / `docsAccessDelete`; inspect syncs with `docsSyncRuns`.',
    '',
    '## Workflow',
    '',
    '1. `docsStructure` for the docs sets and groups; `docsFind` for docs (by docs set, route, source path or title).',
    '2. Before a write, read the record and pass its `updatedAt` as `ifUpdatedAt`.',
    '3. Writes to draft-enabled collections save a draft. Publish (`publish: true` or `docsPublish`) only when the user asked to.',
    '4. Report what changed with the `adminUrl`.',
    '',
    '`sync.contentDrift` / `sync.fieldsDrift` on a doc mean it no longer matches the last sync (someone edited it in the admin); the next sync reports a conflict for it until the edit is reverted (restore a `gitSnapshot` version) or Git is updated.',
    '',
    '## Collections',
    '',
    installed.length
      ? installed.map((collection) => describeCollection(req, collection, access)).join('\n')
      : 'payloadMarkdownDocs() is not installed in this Payload config.',
    '',
    docs
      ? `Docs ${docs.versions ? 'keep a version history (drafts are enabled)' : 'keep no version history (enable `target.enableDrafts` for drafts and versions)'}.`
      : '',
    '',
    '## Permissions',
    '',
    access === 'mcpApiKey'
      ? 'Tools honor the MCP API key: each tool has its own checkbox, and the key needs the matching per-collection Find / Create / Update / Delete checkbox. The docs Update checkbox enables `docsUpdate`, `docsPublish` and `docsRestoreVersion`; the built-in update, create and delete tools are never registered for Git-owned collections.'
      : 'Tools rely on Payload access control for the API key\'s user.',
  ]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
}
