import type { PayloadRequest } from 'payload'

import type { DocsCollectionRole } from '../payload/agentGuard.js'
import type { DocsAgentAccessMode, DocsMcpRequestState } from './access.js'
import type { PayloadMarkdownDocsMcpToolName } from './tools.js'

import {
  DEFAULT_DOCS_ACCESS_COLLECTION_SLUG,
  DEFAULT_DOCS_ASSETS_COLLECTION_SLUG,
  DEFAULT_DOCS_COLLECTION_SLUG,
  DEFAULT_DOCS_GROUPS_COLLECTION_SLUG,
  DEFAULT_DOCS_SETS_COLLECTION_SLUG,
  DEFAULT_DOCS_SYNC_NONCES_COLLECTION_SLUG,
  DEFAULT_DOCS_SYNC_RUNS_COLLECTION_SLUG,
} from '../constants.js'
import { PAYLOAD_MARKDOWN_DOCS_MCP_CONTEXT_KEY } from '../payload/agentGuard.js'
import { isRecord } from '../shared/records.js'
import { toMcpPermissionKey } from './access.js'
import { getDocsCollections } from './collections.js'
import { payloadMarkdownDocsMcpPrompts, payloadMarkdownDocsMcpTools } from './tools.js'

export type PayloadMarkdownDocsMcpOptions = {
  /**
   * `mcpApiKey` (default): tools honor the MCP API key's per-collection checkboxes like the
   * built-in MCP tools. `user`: Payload access control for the key's user only.
   */
  access?: DocsAgentAccessMode
  /**
   * Slugs of the plugin collections when `payloadMarkdownDocs()` uses custom slugs
   * (`collections.<key>.slug` / `target.slug`). Defaults to the plugin defaults.
   */
  collections?: Partial<Record<DocsCollectionRole, string>>
  /**
   * Add the plugin collections to `mcpPlugin({ collections })` so API keys get their
   * checkboxes (default `true`). Entries you configure yourself are kept, narrowed to the
   * operations agents may run on Git-owned collections.
   */
  exposeCollections?: boolean
  /** Register the `docsManage` prompt (default `true`). */
  prompts?: boolean
  /** Tools to register (default: all). See `PAYLOAD_MARKDOWN_DOCS_MCP_READ_ONLY_TOOLS`. */
  tools?: PayloadMarkdownDocsMcpToolName[]
}

type Operation = 'create' | 'delete' | 'find' | 'update'

type CollectionEntry = {
  description?: string
  enabled: boolean | Partial<Record<Operation, boolean>>
} & Record<string, unknown>

type McpOptionsLike = {
  collections?: Record<string, CollectionEntry | undefined>
  mcp?: { prompts?: unknown[]; tools?: unknown[] } & Record<string, unknown>
  overrideAuth?: (
    req: PayloadRequest,
    getDefaultMcpAccessSettings: (overrideApiKey?: null | string) => Promise<unknown>,
  ) => unknown
}

const APPLIED = Symbol.for('@valkyrianlabs/payload-markdown-docs/mcp')

const DEFAULT_SLUGS: Record<DocsCollectionRole, string> = {
  docs: DEFAULT_DOCS_COLLECTION_SLUG,
  docsAccess: DEFAULT_DOCS_ACCESS_COLLECTION_SLUG,
  docsAssets: DEFAULT_DOCS_ASSETS_COLLECTION_SLUG,
  docsGroups: DEFAULT_DOCS_GROUPS_COLLECTION_SLUG,
  docsSets: DEFAULT_DOCS_SETS_COLLECTION_SLUG,
  nonces: DEFAULT_DOCS_SYNC_NONCES_COLLECTION_SLUG,
  syncRuns: DEFAULT_DOCS_SYNC_RUNS_COLLECTION_SLUG,
}

/**
 * The most the built-in collection tools may offer per role. The docs `update` checkbox
 * stays so API keys can grant the docs tools (docsUpdate, docsPublish, docsRestoreVersion)
 * update access; the built-in update tool itself is never registered (see `GIT_OWNED`).
 */
const CEILINGS: Partial<Record<DocsCollectionRole, Operation[]>> = {
  docs: ['find', 'update'],
  docsAssets: ['find'],
  nonces: ['find'],
  syncRuns: ['find'],
}

/** Roles whose built-in create/update/delete tools are masked on every request. */
const GIT_OWNED: DocsCollectionRole[] = ['docs', 'docsAssets', 'nonces', 'syncRuns']

const EXPOSED: Array<{ description: string; operations: Operation[]; role: DocsCollectionRole }> = [
  {
    description:
      'Generated documentation pages synced from Git. Content and frontmatter fields are owned by Git; use the docs* tools for presentation fields, publishing and versions.',
    operations: ['find', 'update'],
    role: 'docs',
  },
  {
    description: 'Docs sets: one per Git docs source (slug = pmdocs --source id), with routing, SEO and publishing security.',
    operations: ['find', 'create', 'update'],
    role: 'docsSets',
  },
  {
    description: 'Docs groups: the navigation groups docs sets belong to.',
    operations: ['find', 'create', 'update', 'delete'],
    role: 'docsGroups',
  },
  {
    description: 'Credentials allowed to sync docs (Ed25519 public keys, trusted GitHub OIDC owners).',
    operations: ['find', 'create', 'update', 'delete'],
    role: 'docsAccess',
  },
  {
    description: 'Docs sync audit log.',
    operations: ['find'],
    role: 'syncRuns',
  },
  {
    description: 'Synced skill files, llms files and static assets (written by Git sync only).',
    operations: ['find'],
    role: 'docsAssets',
  },
]

const narrowEntry = (entry: CollectionEntry, ceiling: Operation[] | undefined): CollectionEntry => {
  if (!ceiling) {
    return entry
  }

  const enabled =
    entry.enabled === true
      ? Object.fromEntries(ceiling.map((operation) => [operation, true]))
      : entry.enabled === false
        ? {}
        : Object.fromEntries(
            Object.entries(entry.enabled ?? {}).filter(
              ([operation, value]) => value === true && ceiling.includes(operation as Operation),
            ),
          )

  return { ...entry, enabled }
}

const configureCollections = (
  current: McpOptionsLike['collections'],
  slugs: Record<DocsCollectionRole, string>,
  expose: boolean,
  added: Set<string>,
): Record<string, CollectionEntry | undefined> => {
  const collections: Record<string, CollectionEntry | undefined> = { ...(current ?? {}) }

  for (const role of Object.keys(slugs) as DocsCollectionRole[]) {
    const entry = collections[slugs[role]]

    if (entry) {
      collections[slugs[role]] = narrowEntry(entry, CEILINGS[role])
    }
  }

  if (expose) {
    for (const { description, operations, role } of EXPOSED) {
      if (!collections[slugs[role]]) {
        collections[slugs[role]] = {
          description,
          enabled: Object.fromEntries(operations.map((operation) => [operation, true])),
        }
        added.add(slugs[role])
      }
    }
  }

  return collections
}

/**
 * plugin-mcp fails every request when `collections` names a collection the config does
 * not have, so entries this wrapper added for disabled plugin collections (or slugs that
 * differ from the plugin's) are dropped on the first request, when the config is known.
 * plugin-mcp reads this same object on every request.
 */
const pruneMissingCollections = (
  req: PayloadRequest,
  collections: Record<string, CollectionEntry | undefined>,
  added: Set<string>,
) => {
  if (added.size === 0) {
    return
  }

  const existing = new Set(req.payload.config.collections.map((collection) => collection.slug))

  for (const slug of added) {
    if (!existing.has(slug)) {
      delete collections[slug]
      req.payload.logger.warn(
        `payloadMarkdownDocs MCP: collection "${slug}" is not in the Payload config; it is not exposed to MCP. Pass its slug in withPayloadMarkdownDocsMcp({ ... }, { collections }) when payloadMarkdownDocs() uses custom slugs.`,
      )
    }
  }

  added.clear()
}

/** Copies the key's permission groups before the built-in tools are masked. */
const snapshotPermissions = (settings: Record<string, unknown>): DocsMcpRequestState['permissions'] =>
  Object.fromEntries(
    Object.entries(settings).flatMap(([key, value]) =>
      key !== 'user' && isRecord(value) ? [[key, { ...value }]] : [],
    ),
  )

const warned = new Set<string>()

/**
 * Masks the built-in create/update/delete tools of Git-owned collections on the settings
 * object plugin-mcp (and payload-markdown's tools) read, in place, so the masking holds
 * whichever wrapper runs first.
 */
const maskGitOwnedTools = (
  req: PayloadRequest,
  settings: Record<string, unknown>,
  slugs: Record<DocsCollectionRole, string>,
) => {
  const installed = getDocsCollections(req.payload)
  const targets = new Set<string>()

  for (const role of GIT_OWNED) {
    targets.add(slugs[role])

    const actual = installed[role]?.slug

    if (actual) {
      targets.add(actual)

      if (actual !== slugs[role] && !warned.has(role)) {
        warned.add(role)
        req.payload.logger.warn(
          `payloadMarkdownDocs MCP: the ${role} collection is "${actual}" but withPayloadMarkdownDocsMcp() was configured for "${slugs[role]}". Pass collections: { ${role}: '${actual}' } so API keys get the right checkboxes.`,
        )
      }
    }
  }

  for (const slug of targets) {
    const key = toMcpPermissionKey(slug)
    const group = settings[key]

    if (isRecord(group)) {
      settings[key] = { ...group, create: false, delete: false, update: false }
    }
  }
}

/**
 * Adds the payload-markdown-docs tools (and prompt) to `@payloadcms/plugin-mcp` options:
 *
 * - exposes the plugin collections so API keys get per-collection checkboxes;
 * - never registers the built-in create/update/delete tools for Git-owned collections
 *   (generated docs, assets, sync runs, nonces), and makes payload-markdown's markdown
 *   write tools refuse them, whichever wrapper is applied first;
 * - records the key's permissions on each request for the docs tools.
 *
 * Compose it with payload-markdown's wrapper in either order:
 *
 * ```ts
 * mcpPlugin(withPayloadMarkdownMcp(withPayloadMarkdownDocsMcp({ collections: { pages: { enabled: true } } })))
 * ```
 *
 * The plugin's Payload-level guard rejects agent writes to Git-owned fields regardless.
 */
export const withPayloadMarkdownDocsMcp = <T extends object>(
  mcpOptions: T,
  options: PayloadMarkdownDocsMcpOptions = {},
): T => {
  // Typed structurally (no dependency on @payloadcms/plugin-mcp's types); T stays the caller's type.
  const current = mcpOptions as { [APPLIED]?: true } & McpOptionsLike

  if (current[APPLIED]) {
    throw new Error(
      'withPayloadMarkdownDocsMcp() was applied twice to the same mcpPlugin options. Apply it once; pass every option in that call.',
    )
  }

  const tools = payloadMarkdownDocsMcpTools(options)
  const prompts = options.prompts === false ? [] : payloadMarkdownDocsMcpPrompts()
  const taken = new Set(
    [...(current.mcp?.tools ?? []), ...(current.mcp?.prompts ?? [])].flatMap((entry) =>
      isRecord(entry) && typeof entry.name === 'string' ? [entry.name] : [],
    ),
  )
  const clash = [...tools, ...prompts].find((entry) => taken.has(entry.name))

  if (clash) {
    throw new Error(
      `withPayloadMarkdownDocsMcp(): mcpPlugin options already define "${clash.name}". Remove the duplicate tool or prompt.`,
    )
  }

  const slugs = { ...DEFAULT_SLUGS, ...options.collections }
  const userOverrideAuth = current.overrideAuth
  const added = new Set<string>()
  const collections = configureCollections(current.collections, slugs, options.exposeCollections !== false, added)

  return {
    ...mcpOptions,
    [APPLIED]: true,
    collections,
    mcp: {
      ...(current.mcp ?? {}),
      prompts: [...(current.mcp?.prompts ?? []), ...prompts],
      tools: [...(current.mcp?.tools ?? []), ...tools],
    },
    overrideAuth: async (
      req: PayloadRequest,
      getDefaultMcpAccessSettings: (overrideApiKey?: null | string) => Promise<unknown>,
    ) => {
      const settings = userOverrideAuth
        ? await userOverrideAuth(req, getDefaultMcpAccessSettings)
        : await getDefaultMcpAccessSettings()

      if (!req.context) {
        req.context = {}
      }

      pruneMissingCollections(req, collections, added)

      if (isRecord(settings)) {
        const state: DocsMcpRequestState = { permissions: snapshotPermissions(settings) }

        req.context[PAYLOAD_MARKDOWN_DOCS_MCP_CONTEXT_KEY] = state
        maskGitOwnedTools(req, settings, slugs)
      }

      return settings
    },
  }
}
