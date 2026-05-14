import type {
  DocsAssetsSyncPlan,
  DocsSyncPlan,
  DocsValidationIssue,
  DocsValidationResult,
} from '../sync/index.js'
import type { PublishPackageSummary } from './filesystem.js'

export type PushSummaryInput = {
  deleteBehavior?: string
  endpoint: string
  mode: 'dry-run' | 'sync'
  publishRequested?: boolean
  response: {
    deleteBehavior?: string
    ok?: boolean
    publishRequested?: boolean
    summary?: {
      archive?: number
      assetArchive?: number
      assetCreate?: number
      assetDelete?: number
      assetUnchanged?: number
      assetUpdate?: number
      create?: number
      delete?: number
      draft?: number
      unchanged?: number
      update?: number
      warnings?: number
    }
    syncRunId?: string
  }
  sourceId: string
}

const formatIssue = (issue: DocsValidationIssue): string => {
  if (issue.path) {
    return `- ${issue.path}: ${issue.message}`
  }

  return `- ${issue.message}`
}

export const formatIssues = (issues: DocsValidationIssue[]): string => {
  if (issues.length === 0) {
    return ''
  }

  return issues.map(formatIssue).join('\n')
}

export const formatValidationSummary = ({
  fileCount,
  packageSummary,
  root,
  sourceId,
  validation,
}: {
  fileCount: number
  packageSummary?: PublishPackageSummary
  root: string
  sourceId: string
  validation: DocsValidationResult
}): string => {
  const lines = [
    'payload-markdown-docs validate',
    '',
    `Source: ${sourceId}`,
    `Root: ${root}`,
    `Files: ${fileCount}`,
    ...(packageSummary
      ? [
          `Assets: ${packageSummary.assets}`,
          `Skills: ${packageSummary.skills}`,
          `llms.txt: ${packageSummary.llms}`,
          `llms-full.txt: ${packageSummary.llmsFull}`,
        ]
      : []),
    `Status: ${validation.ok ? 'valid' : 'invalid'}`,
  ]

  if (validation.warnings.length > 0) {
    lines.push('', 'Warnings:', formatIssues(validation.warnings))
  }

  if (!validation.ok && validation.issues.length > 0) {
    lines.push('', 'Errors:', formatIssues(validation.issues))
  }

  return `${lines.join('\n')}\n`
}

export const formatPlanSummary = (
  plan: DocsSyncPlan,
  options: {
    assetPlan?: DocsAssetsSyncPlan
    packageSummary?: PublishPackageSummary
  } = {},
): string => {
  const assetPlan = options.assetPlan
  const lines = [
    'payload-markdown-docs plan',
    '',
    ...(options.packageSummary
      ? [
          `Docs: ${options.packageSummary.docs}`,
          `Assets: ${options.packageSummary.assets}`,
          `Skills: ${options.packageSummary.skills}`,
          `llms.txt: ${options.packageSummary.llms}`,
          `llms-full.txt: ${options.packageSummary.llmsFull}`,
          '',
        ]
      : []),
    `Create: ${plan.create.length}`,
    `Update: ${plan.update.length}`,
    `Unchanged: ${plan.unchanged.length}`,
    `Archive: ${plan.archive.length}`,
    `Delete: ${plan.delete.length}`,
    `Draft: ${plan.draft.length}`,
    `Warnings: ${plan.warnings.length}`,
  ]

  if (assetPlan) {
    lines.push(
      '',
      `Asset create: ${assetPlan.create.length}`,
      `Asset update: ${assetPlan.update.length}`,
      `Asset unchanged: ${assetPlan.unchanged.length}`,
      `Asset archive: ${assetPlan.archive.length}`,
      `Asset delete: ${assetPlan.delete.length}`,
      `Asset warnings: ${assetPlan.warnings.length}`,
    )
  }

  const warnings = [...plan.warnings, ...(assetPlan?.warnings ?? [])]

  if (warnings.length > 0) {
    lines.push('', 'Warnings:', formatIssues(warnings))
  }

  return `${lines.join('\n')}\n`
}

export const formatPushSummary = ({
  deleteBehavior,
  endpoint,
  mode,
  publishRequested,
  response,
  sourceId,
}: PushSummaryInput): string => {
  const summary = response.summary ?? {}
  const lines = [
    'payload-markdown-docs push',
    '',
    `Endpoint: ${endpoint}`,
    `Mode: ${mode}`,
    `Source: ${sourceId}`,
    `Publish requested: ${(publishRequested ?? response.publishRequested) === true ? 'yes' : 'no'}`,
    `Delete behavior: ${deleteBehavior ?? response.deleteBehavior ?? 'unknown'}`,
    '',
    `Create: ${summary.create ?? 0}`,
    `Update: ${summary.update ?? 0}`,
    `Unchanged: ${summary.unchanged ?? 0}`,
    `Archive: ${summary.archive ?? 0}`,
    `Delete: ${summary.delete ?? 0}`,
    `Draft: ${summary.draft ?? 0}`,
    `Asset create: ${summary.assetCreate ?? 0}`,
    `Asset update: ${summary.assetUpdate ?? 0}`,
    `Asset unchanged: ${summary.assetUnchanged ?? 0}`,
    `Asset archive: ${summary.assetArchive ?? 0}`,
    `Asset delete: ${summary.assetDelete ?? 0}`,
    `Warnings: ${summary.warnings ?? 0}`,
    '',
    `Status: ${mode === 'sync' ? 'applied' : 'accepted'}`,
  ]

  if (response.syncRunId) {
    lines.push(`Sync run: ${response.syncRunId}`)
  }

  return `${lines.join('\n')}\n`
}

export const printJson = (value: unknown, pretty = false): string =>
  `${JSON.stringify(value, null, pretty ? 2 : 0)}\n`
