import type {
  DocsSyncPlan,
  DocsValidationIssue,
  DocsValidationResult,
} from '../sync/index.js'

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
  root,
  sourceId,
  validation,
}: {
  fileCount: number
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

export const formatPlanSummary = (plan: DocsSyncPlan): string => {
  const lines = [
    'payload-markdown-docs plan',
    '',
    `Create: ${plan.create.length}`,
    `Update: ${plan.update.length}`,
    `Unchanged: ${plan.unchanged.length}`,
    `Archive: ${plan.archive.length}`,
    `Delete: ${plan.delete.length}`,
    `Draft: ${plan.draft.length}`,
    `Warnings: ${plan.warnings.length}`,
  ]

  if (plan.warnings.length > 0) {
    lines.push('', 'Warnings:', formatIssues(plan.warnings))
  }

  return `${lines.join('\n')}\n`
}

export const printJson = (value: unknown, pretty = false): string =>
  `${JSON.stringify(value, null, pretty ? 2 : 0)}\n`

