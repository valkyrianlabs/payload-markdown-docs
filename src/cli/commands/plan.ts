import { readFile } from 'node:fs/promises'

import type {
  DocsDeleteBehavior,
  ExistingDocsRecord,
} from '../../sync/index.js'
import type { CliResult, ParsedCliArgs } from '../types.js'

import {
  buildDocsManifest,
  planDocsSync,
  validateDocsManifest,
} from '../../sync/index.js'
import { walkDocsFiles } from '../filesystem.js'
import { formatIssues, formatPlanSummary, printJson } from '../format.js'
import { getFlagBoolean, getFlagString } from '../parseArgs.js'
import { getDocsCommandOptions } from './validate.js'

const deleteBehaviors = new Set<DocsDeleteBehavior>([
  'archive',
  'delete',
  'draft',
  'ignore',
])

const isExistingDocsRecord = (value: unknown): value is ExistingDocsRecord => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }

  const record = value as Record<string, unknown>

  return (
    typeof record.route === 'string' &&
    typeof record.sourcePath === 'string' &&
    (record.sourceHash === undefined || typeof record.sourceHash === 'string') &&
    (record.title === undefined || typeof record.title === 'string') &&
    (record.archived === undefined || typeof record.archived === 'boolean')
  )
}

const loadExistingDocs = async (
  existingPath: string | undefined,
): Promise<CliResult | ExistingDocsRecord[]> => {
  if (!existingPath) {
    return []
  }

  let parsed: unknown

  try {
    const raw = await readFile(existingPath, 'utf8')
    parsed = JSON.parse(raw) as unknown
  } catch (error) {
    return {
      exitCode: 1,
      stderr:
        error instanceof Error
          ? `Could not read --existing file: ${error.message}\n`
          : 'Could not read --existing file.\n',
    }
  }

  if (!Array.isArray(parsed) || !parsed.every(isExistingDocsRecord)) {
    return {
      exitCode: 1,
      stderr: '--existing must point to a JSON array of existing docs records.\n',
    }
  }

  return parsed
}

export const runPlanCommand = async (args: ParsedCliArgs): Promise<CliResult> => {
  const options = getDocsCommandOptions(args)

  if ('exitCode' in options) {
    return options
  }

  const deleteBehaviorFlag = getFlagString(args, 'delete-behavior')

  if (
    deleteBehaviorFlag !== undefined &&
    !deleteBehaviors.has(deleteBehaviorFlag as DocsDeleteBehavior)
  ) {
    return {
      exitCode: 1,
      stderr: '--delete-behavior must be archive, delete, draft, or ignore.\n',
    }
  }

  const existing = await loadExistingDocs(getFlagString(args, 'existing'))

  if ('exitCode' in existing) {
    return existing
  }

  const files = await walkDocsFiles({
    root: options.docsRoot,
  })
  const deleteBehavior = deleteBehaviorFlag as DocsDeleteBehavior | undefined
  const manifest = buildDocsManifest({
    branch: options.branch,
    commit: options.commit,
    deleteBehavior,
    files,
    repository: options.repository,
    root: options.sourceRoot,
    sourceId: options.sourceId,
  })
  const validation = validateDocsManifest(manifest, {
    maxFileBytes: options.maxFileBytes,
    maxFiles: options.maxFiles,
    maxTotalBytes: options.maxTotalBytes,
    routeBase: options.routeBase,
  })

  if (!validation.ok) {
    return {
      exitCode: 1,
      stderr: `Manifest is invalid.\n\nErrors:\n${formatIssues(validation.issues)}\n`,
    }
  }

  const plan = planDocsSync({
    deleteBehavior,
    desired: validation.data,
    existing,
  })

  if (getFlagBoolean(args, 'json')) {
    return {
      exitCode: 0,
      stdout: printJson(plan, getFlagBoolean(args, 'pretty')),
    }
  }

  return {
    exitCode: 0,
    stdout: formatPlanSummary(plan),
  }
}
