import type { PayloadRequest } from 'payload'

import { z } from 'zod'

import type { DocsAgentAccessMode } from './access.js'

import { idArg } from './collections.js'
import { findDocs, setPublishStatus, updateDocsRecord } from './docs.js'
import { deleteDocsAccess, listDocsAccess, saveDocsAccess } from './docsAccess.js'
import { DocsAgentError } from './errors.js'
import { getDocsGuide } from './guide.js'
import { getDocsStructure, saveDocsGroup, saveDocsSet } from './structure.js'
import { findSyncRuns } from './syncRuns.js'
import { listVersions, readVersion, restoreVersion } from './versions.js'

export type PayloadMarkdownDocsMcpToolName =
  | 'access'
  | 'deleteAccess'
  | 'find'
  | 'guide'
  | 'publish'
  | 'restore'
  | 'saveAccess'
  | 'saveGroup'
  | 'saveSet'
  | 'structure'
  | 'syncRuns'
  | 'update'
  | 'versions'

/** Every tool, in registration order. */
export const PAYLOAD_MARKDOWN_DOCS_MCP_TOOLS: PayloadMarkdownDocsMcpToolName[] = [
  'guide',
  'structure',
  'find',
  'update',
  'publish',
  'versions',
  'restore',
  'saveSet',
  'saveGroup',
  'access',
  'saveAccess',
  'deleteAccess',
  'syncRuns',
]

/** The tools that never write: pass as `tools` for a read-only connection. */
export const PAYLOAD_MARKDOWN_DOCS_MCP_READ_ONLY_TOOLS: PayloadMarkdownDocsMcpToolName[] = [
  'guide',
  'structure',
  'find',
  'versions',
  'access',
  'syncRuns',
]

type ToolResult = { content: Array<{ text: string; type: 'text' }>; isError?: boolean }

/** Shape of a custom tool for `mcpPlugin({ mcp: { tools } })`. */
export type PayloadMarkdownDocsMcpTool = {
  description: string
  handler: (args: Record<string, unknown>, req: PayloadRequest, extra: unknown) => Promise<ToolResult>
  name: string
  parameters: z.ZodRawShape
}

/** Shape of a custom prompt for `mcpPlugin({ mcp: { prompts } })`. */
export type PayloadMarkdownDocsMcpPrompt = {
  argsSchema: z.ZodRawShape
  description: string
  handler: (
    args: Record<string, unknown>,
    req: PayloadRequest,
    extra: unknown,
  ) => { messages: Array<{ content: { text: string; type: 'text' }; role: 'assistant' | 'user' }> }
  name: string
  title: string
}

const json = (value: unknown): ToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
})

const errorResult = (error: unknown): ToolResult => {
  if (error instanceof DocsAgentError) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              error: error.code,
              message: error.message,
              ...(error.details ? { details: error.details } : {}),
            },
            null,
            2,
          ),
        },
      ],
      isError: true,
    }
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          error: 'unexpected',
          message: error instanceof Error ? error.message : String(error),
        }),
      },
    ],
    isError: true,
  }
}

const safely =
  (run: (args: Record<string, unknown>, req: PayloadRequest) => Promise<ToolResult> | ToolResult) =>
  async (args: Record<string, unknown>, req: PayloadRequest): Promise<ToolResult> => {
    try {
      return await run(args, req)
    } catch (error) {
      return errorResult(error)
    }
  }

const str = (value: unknown): string | undefined => (typeof value === 'string' && value ? value : undefined)
const bool = (value: unknown): boolean | undefined => (typeof value === 'boolean' ? value : undefined)
const num = (value: unknown): number | undefined => (typeof value === 'number' ? value : undefined)
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
const oneOf = <T extends string>(value: unknown, options: readonly T[]): T | undefined =>
  options.includes(value as T) ? (value as T) : undefined

const id = z.union([z.string(), z.number()])
const nullableId = z.union([z.string(), z.number(), z.null()])
const versionedCollection = z
  .enum(['docs', 'docsSets'])
  .optional()
  .describe('"docs" (default) for generated docs, "docsSets" for docs sets.')
const ifUpdatedAt = z
  .string()
  .optional()
  .describe('updatedAt from the last read. The write is refused if the record changed since.')
const dryRun = z.boolean().optional().describe('Validate and report without saving.')
const overrideLock = z
  .boolean()
  .optional()
  .describe('Write even if someone has the record open in the admin. Ask the user first.')

const docsData = z
  .object({
    heroImage: z
      .union([z.string(), z.number(), z.null(), z.object({ relationTo: z.string(), value: id })])
      .optional()
      .describe('Media id for the hero image above the doc (null removes it).'),
    overrides: z
      .object({
        hideFromNav: z.boolean().optional().describe('Hide the doc from the sidebar.'),
        navTitle: z.string().nullable().optional().describe('Sidebar label instead of the Git navTitle/title.'),
      })
      .optional(),
    parent: nullableId.optional().describe('Parent doc id (admin-owned; sync does not use it).'),
    publishedAt: z.string().nullable().optional().describe('ISO date shown as the publish date.'),
  })
  .passthrough()
  .describe(
    'Admin-owned fields only. Git-owned fields (title, navTitle, description, order, route, content, ...) are refused with sync_owned: change them in Git.',
  )

const docsSetData = z
  .object({
    slug: z.string().optional().describe('The Git docs source id (`pmdocs --source`). Changing it breaks existing syncs.'),
    advancedSecurity: z
      .object({
        allowedWorkflowRefs: z
          .array(z.string())
          .optional()
          .describe('Exact GitHub workflow refs, e.g. owner/repo/.github/workflows/docs.yml@refs/heads/main.'),
        enabled: z.boolean().optional(),
      })
      .optional()
      .describe('GitHub OIDC only: restrict publishing to listed workflow refs.'),
    allowPullRequests: z.boolean().optional().describe('Allow pull request events to dry-run or publish.'),
    allowTagRefs: z.boolean().optional().describe('GitHub OIDC only: also accept refs/tags/* refs.'),
    branch: z.string().optional().describe('Git branch allowed to publish (default main).'),
    description: z.string().nullable().optional(),
    group: nullableId.optional().describe('Docs group id.'),
    meta: z
      .object({
        description: z.string().nullable().optional(),
        image: nullableId.optional().describe('Media id.'),
        title: z.string().nullable().optional(),
      })
      .optional()
      .describe('SEO metadata.'),
    publishedAt: z.string().nullable().optional(),
    repositories: z
      .array(z.string())
      .optional()
      .describe('GitHub OIDC only: repositories allowed to publish (owner/repo). Empty: any trusted repository.'),
    routeMode: z.enum(['docs-root', 'product-nested']).optional(),
    title: z.string().optional(),
  })
  .passthrough()

const docsGroupData = z
  .object({
    slug: z.string().optional(),
    description: z.string().nullable().optional(),
    navTitle: z.string().nullable().optional(),
    order: z.number().optional(),
    pageMode: z.enum(['auto', 'custom']).optional().describe('auto: generated landing page; custom: the site owns the group route.'),
    parent: nullableId.optional().describe('Parent group id.'),
    title: z.string().optional(),
  })
  .passthrough()

const docsAccessData = z
  .object({
    accessType: z.enum(['ed25519', 'githubOidc']).optional(),
    docsSets: z.array(id).optional().describe('Docs set ids this credential may sync. Empty allows every docs set (not recommended).'),
    keyId: z.string().optional().describe('ed25519: key id sent by signed sync requests.'),
    limitRepos: z.boolean().optional().describe('githubOidc: only the listed repositories.'),
    owner: z.string().optional().describe('githubOidc: trusted GitHub owner or organization.'),
    publicKey: z.string().optional().describe('ed25519: PEM or OpenSSH public key. Never a private key.'),
    repositories: z.array(z.string()).optional().describe('githubOidc with limitRepos: repo or owner/repo names.'),
    title: z.string().optional(),
  })
  .passthrough()

export type PayloadMarkdownDocsMcpToolsOptions = {
  access?: DocsAgentAccessMode
  tools?: PayloadMarkdownDocsMcpToolName[]
}

/**
 * The payload-markdown-docs MCP tools. Pass them to `mcpPlugin({ mcp: { tools } })`, or
 * use `withPayloadMarkdownDocsMcp()`, which also exposes the plugin collections, keeps
 * the built-in write tools off Git-owned collections and records the key's permissions.
 */
export const payloadMarkdownDocsMcpTools = (
  options: PayloadMarkdownDocsMcpToolsOptions = {},
): PayloadMarkdownDocsMcpTool[] => {
  const access = options.access ?? 'mcpApiKey'
  const enabled = new Set(options.tools ?? PAYLOAD_MARKDOWN_DOCS_MCP_TOOLS)

  const tools: Array<{ key: PayloadMarkdownDocsMcpToolName } & PayloadMarkdownDocsMcpTool> = [
    {
      name: 'docsGuide',
      description:
        'Start here. Explains how this site\'s Git-backed docs work and what agents may change: the docs collections and slugs, which fields Git owns (never writable over MCP) and which are admin-owned, drafts and versions, and what this connection is allowed to do.',
      handler: safely((_args, req) => ({ content: [{ type: 'text', text: getDocsGuide({ access, req }) }] })),
      key: 'guide',
      parameters: {},
    },
    {
      name: 'docsStructure',
      description:
        'Lists docs groups and docs sets (one per Git docs source; slug = pmdocs --source id) with routing, SEO, publishing security (branch, repositories, workflow refs), last sync status and doc counts.',
      handler: safely(async (_args, req) => json(await getDocsStructure({ access, req }))),
      key: 'structure',
      parameters: {},
    },
    {
      name: 'docsFind',
      description:
        'Finds generated docs (latest drafts): id, title, route, sourcePath, docs set, status, archived, sync state (contentDrift/fieldsDrift = edited outside Git), the admin-owned fields docsUpdate may change, and updatedAt. Pass id for one doc; includeContent for the markdown.',
      handler: safely(async (args, req) =>
        json(
          await findDocs({
            id: idArg(args.id),
            access,
            docsSet: idArg(args.docsSet),
            includeArchived: bool(args.includeArchived),
            includeContent: bool(args.includeContent),
            limit: num(args.limit),
            page: num(args.page),
            req,
            route: str(args.route),
            search: str(args.search),
            sourcePath: str(args.sourcePath),
            status: oneOf(args.status, ['draft', 'published'] as const),
          }),
        ),
      ),
      key: 'find',
      parameters: {
        id: id.optional().describe('Doc id.'),
        docsSet: id.optional().describe('Docs set id or slug.'),
        includeArchived: z.boolean().optional().describe('Include docs archived by sync (default false).'),
        includeContent: z.boolean().optional().describe('Include the markdown content (default false).'),
        limit: z.number().int().min(1).max(50).optional().describe('Maximum docs (default 10).'),
        page: z.number().int().min(1).optional(),
        route: z.string().optional().describe('Exact route, e.g. /docs/getting-started.'),
        search: z.string().optional().describe('Title contains, or exact route or source path.'),
        sourcePath: z.string().optional().describe('Exact path in the docs package, e.g. guides/install.md.'),
        status: z.enum(['draft', 'published']).optional(),
      },
    },
    {
      name: 'docsUpdate',
      description:
        'Changes admin-owned fields of one generated doc: heroImage, overrides.navTitle, overrides.hideFromNav, parent, publishedAt (and fields other plugins add). Git-owned fields (content, title, navTitle, description, order, route, ...) are refused with sync_owned. Saves a draft for draft-enabled docs (publish=true to publish).',
      handler: safely(async (args, req) =>
        json(
          await updateDocsRecord({
            id: idArg(args.id) as number | string,
            access,
            data: record(args.data),
            dryRun: bool(args.dryRun),
            ifUpdatedAt: str(args.ifUpdatedAt),
            overrideLock: bool(args.overrideLock),
            publish: bool(args.publish),
            req,
          }),
        ),
      ),
      key: 'update',
      parameters: {
        id: id.describe('Doc id.'),
        data: docsData,
        dryRun,
        ifUpdatedAt,
        overrideLock,
        publish: z.boolean().optional().describe('Publish instead of saving a draft. Only when the user asked to publish.'),
      },
    },
    {
      name: 'docsPublish',
      description:
        'Publishes the latest draft (content Git synced as a draft) or unpublishes a generated doc or docs set. Only when the user asked. Archived docs cannot be published.',
      handler: safely(async (args, req) =>
        json(
          await setPublishStatus({
            id: idArg(args.id) as number | string,
            access,
            action: oneOf(args.action, ['publish', 'unpublish'] as const) ?? 'publish',
            collection: oneOf(args.collection, ['docs', 'docsSets'] as const),
            overrideLock: bool(args.overrideLock),
            req,
          }),
        ),
      ),
      key: 'publish',
      parameters: {
        id: id.describe('Doc or docs set id.'),
        action: z.enum(['publish', 'unpublish']).optional().describe('Default publish.'),
        collection: versionedCollection,
        overrideLock,
      },
    },
    {
      name: 'docsVersions',
      description:
        'Version history of a generated doc or docs set, newest first: versionId, status, date, title/route and, for docs, gitSnapshot (exactly what Git sync wrote; only those can be restored). Pass versionId to inspect one version and the fields it changes.',
      handler: safely(async (args, req) => {
        const collection = oneOf(args.collection, ['docs', 'docsSets'] as const)
        const versionId = idArg(args.versionId)

        if (versionId !== undefined) {
          return json(
            await readVersion({ access, collection, includeContent: bool(args.includeContent), req, versionId }),
          )
        }

        return json(
          await listVersions({ id: idArg(args.id) as number | string, access, collection, limit: num(args.limit), req }),
        )
      }),
      key: 'versions',
      parameters: {
        id: id.optional().describe('Record id whose versions to list.'),
        collection: versionedCollection,
        includeContent: z.boolean().optional().describe('With versionId: include the doc markdown of that version.'),
        limit: z.number().int().min(1).max(50).optional().describe('Maximum versions (default 10).'),
        versionId: id.optional().describe('Inspect this version instead of listing.'),
      },
    },
    {
      name: 'docsRestoreVersion',
      description:
        'Rolls a generated doc or docs set back to a previous version. Docs versions must be Git snapshots (gitSnapshot: true), so a rollback never puts content on the site that did not come from Git. Restores as a draft unless publish=true. The next sync from Git still updates the doc.',
      handler: safely(async (args, req) =>
        json(
          await restoreVersion({
            access,
            collection: oneOf(args.collection, ['docs', 'docsSets'] as const),
            ifUpdatedAt: str(args.ifUpdatedAt),
            publish: bool(args.publish),
            req,
            versionId: idArg(args.versionId) as number | string,
          }),
        ),
      ),
      key: 'restore',
      parameters: {
        collection: versionedCollection,
        ifUpdatedAt,
        publish: z.boolean().optional().describe('Restore as the live version. Only when the user asked to publish.'),
        versionId: id.describe('versionId from docsVersions.'),
      },
    },
    {
      name: 'docsSetSave',
      description:
        'Creates (no id) or updates a docs set: title, description, SEO meta, group, routeMode, and publishing security (branch, allowPullRequests, allowTagRefs, repositories, advancedSecurity). The slug is the Git --source id. Saves a draft unless publish=true. Sync status fields are refused.',
      handler: safely(async (args, req) =>
        json(
          await saveDocsSet({
            id: idArg(args.id),
            access,
            data: record(args.data),
            dryRun: bool(args.dryRun),
            ifUpdatedAt: str(args.ifUpdatedAt),
            overrideLock: bool(args.overrideLock),
            publish: bool(args.publish),
            req,
          }),
        ),
      ),
      key: 'saveSet',
      parameters: {
        id: id.optional().describe('Docs set id to update; omit to create.'),
        data: docsSetData,
        dryRun,
        ifUpdatedAt,
        overrideLock,
        publish: z.boolean().optional().describe('Publish instead of saving a draft. Only when the user asked to publish.'),
      },
    },
    {
      name: 'docsGroupSave',
      description:
        'Creates (no id) or updates a docs group: title, slug, description, navTitle, order, parent, pageMode. Groups have no drafts: changes are live.',
      handler: safely(async (args, req) =>
        json(
          await saveDocsGroup({
            id: idArg(args.id),
            access,
            data: record(args.data),
            dryRun: bool(args.dryRun),
            ifUpdatedAt: str(args.ifUpdatedAt),
            overrideLock: bool(args.overrideLock),
            req,
          }),
        ),
      ),
      key: 'saveGroup',
      parameters: {
        id: id.optional().describe('Group id to update; omit to create.'),
        data: docsGroupData,
        dryRun,
        ifUpdatedAt,
        overrideLock,
      },
    },
    {
      name: 'docsAccessList',
      description:
        'Lists the credentials allowed to sync docs: Ed25519 keys (keyId, public key) and trusted GitHub OIDC owners (optionally limited to repositories), with the docs sets each may sync.',
      handler: safely(async (args, req) =>
        json(
          await listDocsAccess({
            id: idArg(args.id),
            access,
            accessType: oneOf(args.accessType, ['ed25519', 'githubOidc'] as const),
            limit: num(args.limit),
            req,
          }),
        ),
      ),
      key: 'access',
      parameters: {
        id: id.optional(),
        accessType: z.enum(['ed25519', 'githubOidc']).optional(),
        limit: z.number().int().min(1).max(100).optional().describe('Maximum entries (default 25).'),
      },
    },
    {
      name: 'docsAccessSave',
      description:
        'Creates (no id) or updates a sync credential. ed25519: title, keyId, publicKey (public key only; private keys are refused). githubOidc: title, owner, limitRepos, repositories. Scope it with docsSets. Changes who can publish docs: confirm with the user.',
      handler: safely(async (args, req) =>
        json(
          await saveDocsAccess({
            id: idArg(args.id),
            access,
            data: record(args.data),
            dryRun: bool(args.dryRun),
            ifUpdatedAt: str(args.ifUpdatedAt),
            req,
          }),
        ),
      ),
      key: 'saveAccess',
      parameters: {
        id: id.optional().describe('Credential id to update; omit to create.'),
        data: docsAccessData,
        dryRun,
        ifUpdatedAt,
      },
    },
    {
      name: 'docsAccessDelete',
      description:
        'Deletes a sync credential. Syncs signed with that key, or from that GitHub owner, stop working. Confirm with the user first.',
      handler: safely(async (args, req) =>
        json(await deleteDocsAccess({ id: idArg(args.id) as number | string, access, req })),
      ),
      key: 'deleteAccess',
      parameters: {
        id: id.describe('Credential id.'),
      },
    },
    {
      name: 'docsSyncRuns',
      description:
        'The sync audit log, newest first: source, repository, branch, commit, actor, mode (dry-run/sync), status, file counts, warnings and errors. Pass id for one run with its full plan summary.',
      handler: safely(async (args, req) =>
        json(
          await findSyncRuns({
            id: idArg(args.id),
            access,
            limit: num(args.limit),
            mode: oneOf(args.mode, ['dry-run', 'sync'] as const),
            req,
            sourceId: str(args.sourceId),
            status: oneOf(args.status, ['failed', 'pending', 'success'] as const),
          }),
        ),
      ),
      key: 'syncRuns',
      parameters: {
        id: id.optional().describe('Sync run id.'),
        limit: z.number().int().min(1).max(50).optional().describe('Maximum runs (default 10).'),
        mode: z.enum(['dry-run', 'sync']).optional(),
        sourceId: z.string().optional().describe('Docs set slug (pmdocs --source id).'),
        status: z.enum(['failed', 'pending', 'success']).optional(),
      },
    },
  ]

  return tools.filter((tool) => enabled.has(tool.key)).map(({ key: _key, ...tool }) => tool)
}

/** The `docsManage` prompt: the agent workflow as a reusable prompt (a slash command in many clients). */
export const payloadMarkdownDocsMcpPrompts = (): PayloadMarkdownDocsMcpPrompt[] => [
  {
    name: 'docsManage',
    argsSchema: {
      docsSet: z.string().optional().describe('Docs set slug, if the task is about one docs set.'),
      request: z.string().describe('What to do, for example "hide the changelog from the sidebar".'),
    },
    description: 'Manage the Git-backed docs (presentation fields, publishing, versions, docs sets, sync access) without touching Git-owned content.',
    handler: (args) => ({
      messages: [
        {
          content: {
            type: 'text',
            text: [
              `Manage the documentation in Payload: ${str(args.request) ?? ''}`,
              str(args.docsSet) ? `Docs set: ${str(args.docsSet)}` : '',
              '',
              'Follow the payload-markdown-docs workflow:',
              '1. Call docsGuide and respect what it says Git owns: never try to change doc content or frontmatter fields over MCP.',
              '2. Call docsStructure / docsFind to locate the records and their updatedAt.',
              '3. Make the change with the docs* tools, passing ifUpdatedAt. Save drafts; publish only if I ask.',
              '4. If the request needs a content change, tell me which Markdown file to edit in Git instead.',
              '5. Report what changed with the adminUrl.',
            ]
              .filter((line, index) => line || index > 1)
              .join('\n'),
          },
          role: 'user',
        },
      ],
    }),
    title: 'Manage Git-backed docs',
  },
]
