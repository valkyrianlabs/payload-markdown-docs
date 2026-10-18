/**
 * Project metadata on docs sets: the technology stack and the agent-maintained title and
 * description that `pmdocs` syncs from `docs/stack.toml`.
 *
 * Git owns `stack` and the last synced title/description (`sync.projectTitle`,
 * `sync.projectDescription`). `manualTitleDescription` decides who owns the docs set's
 * `title` and `description`: the admin (true) or the agent (false). Records created
 * before the toggle existed have no value, which counts as manual, so syncing never
 * replaces a title an admin already wrote.
 *
 * The sync endpoint writes the main record only (DOCS-11), so a saved version (an older
 * draft, or a version being restored) can carry stale project metadata. The guard below
 * restores the Git-owned values from the main record on every write that is not a sync.
 */
import type { CollectionBeforeChangeHook, FieldHook } from 'payload'

import type { DocsProjectMetadata, DocsProjectStackCategory } from '../sync/index.js'

import { isRecord } from '../shared/records.js'
import { getStackCategories } from '../shared/stack.js'

/** `req.context` key the sync endpoint sets on its own docs set writes. */
export const PAYLOAD_MARKDOWN_DOCS_SYNC_CONTEXT_KEY = 'payloadMarkdownDocsSync'

export type DocsSetProjectFieldOutcome = 'manual' | 'not_provided' | 'unchanged' | 'updated'
export type DocsSetProjectStackOutcome = 'cleared' | 'not_provided' | 'unchanged' | 'updated'

/** Reported as `project` in the sync response when the manifest carried project metadata. */
export type DocsSetProjectOutcome = {
  applied: boolean
  description: DocsSetProjectFieldOutcome
  stack: DocsSetProjectStackOutcome
  title: DocsSetProjectFieldOutcome
}

export type DocsSetProjectPlan = {
  /** Docs set fields to write with the sync bookkeeping. */
  data: Record<string, unknown>
  outcome: Omit<DocsSetProjectOutcome, 'applied'>
}

/** Missing (pre-existing records) and `true` both mean the admin owns title and description. */
export const isManualTitleDescription = (value: unknown): boolean => value !== false

/** Displays records created before the toggle existed as manual, matching their behavior. */
export const readManualTitleDescription: FieldHook = ({ value }) => isManualTitleDescription(value)

const getOptionalString = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined

/** The stored stack as normalized categories (anything malformed reads as empty). */
export const getDocsSetStack = (value: unknown): DocsProjectStackCategory[] => getStackCategories(value)

const planField = ({
  current,
  manual,
  next,
}: {
  current: unknown
  manual: boolean
  next: string | undefined
}): DocsSetProjectFieldOutcome => {
  if (next === undefined) {
    return 'not_provided'
  }

  if (manual) {
    return 'manual'
  }

  return getOptionalString(current) === next ? 'unchanged' : 'updated'
}

/**
 * Decides what a sync writes for the manifest's project metadata, against the docs set's
 * main record (never a draft version).
 */
export const planDocsSetProjectUpdate = ({
  current,
  project,
}: {
  current: Record<string, unknown>
  project: DocsProjectMetadata
}): DocsSetProjectPlan => {
  const manual = isManualTitleDescription(current.manualTitleDescription)
  const title = planField({ current: current.title, manual, next: project.title })
  const description = planField({ current: current.description, manual, next: project.description })
  const data: Record<string, unknown> = {}
  let stack: DocsSetProjectStackOutcome = 'not_provided'

  if (project.stack !== undefined) {
    const currentStack = getDocsSetStack(current.stack)

    stack =
      JSON.stringify(currentStack) === JSON.stringify(project.stack)
        ? 'unchanged'
        : project.stack.length === 0
          ? 'cleared'
          : 'updated'
    data.stack = project.stack
  }

  if (title === 'updated') {
    data.title = project.title
  }

  if (description === 'updated') {
    data.description = project.description
  }

  return {
    data,
    outcome: { description, stack, title },
  }
}

/** The `sync` group values that record what the agent last supplied. */
export const getDocsSetProjectSyncFields = (project: DocsProjectMetadata): Record<string, unknown> => ({
  projectDescription: project.description ?? null,
  projectTitle: project.title ?? null,
})

/**
 * Keeps Git-owned project metadata authoritative on admin, API, draft, publish and
 * restore writes. Sync writes (marked through `req.context`) pass through.
 */
export const createDocsSetProjectGuard =
  ({ collectionSlug }: { collectionSlug: string }): CollectionBeforeChangeHook =>
  async ({ data, operation, originalDoc, req }) => {
    if (req.context?.[PAYLOAD_MARKDOWN_DOCS_SYNC_CONTEXT_KEY] === true || !isRecord(data)) {
      return data
    }

    if (operation === 'create') {
      const { stack: _stack, ...rest } = data
      const sync = isRecord(rest.sync) ? rest.sync : undefined

      return {
        ...rest,
        manualTitleDescription: rest.manualTitleDescription === true,
        ...(sync ? { sync: { ...sync, projectDescription: null, projectTitle: null } } : {}),
      }
    }

    const id = isRecord(originalDoc) ? originalDoc.id : undefined

    if (id === undefined || id === null) {
      return data
    }

    // Main record, not `originalDoc`: for a drafts collection that is the latest version.
    const main = (await req.payload.db.findOne({
      collection: collectionSlug,
      req,
      where: { id: { equals: id } },
    })) as null | Record<string, unknown>

    if (!main) {
      return data
    }

    const mainSync = isRecord(main.sync) ? main.sync : {}
    const projectTitle = getOptionalString(mainSync.projectTitle)
    const projectDescription = getOptionalString(mainSync.projectDescription)
    const manual = isManualTitleDescription(
      data.manualTitleDescription === undefined ? main.manualTitleDescription : data.manualTitleDescription,
    )

    return {
      ...data,
      ...(manual
        ? {}
        : {
            ...(projectTitle ? { title: projectTitle } : {}),
            ...(projectDescription ? { description: projectDescription } : {}),
          }),
      stack: main.stack ?? null,
      sync: {
        ...(isRecord(data.sync) ? data.sync : {}),
        projectDescription: projectDescription ?? null,
        projectTitle: projectTitle ?? null,
      },
    }
  }
