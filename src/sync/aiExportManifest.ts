import type { DocsValidationIssue } from './validate.js'

import { normalizeRoutePath } from '../routing/index.js'
import { normalizeDocsPath } from './paths.js'

export const AI_MARKDOWN_EXPORT_MANIFEST_FILENAMES = [
  'index.ai.yml',
  'index.ai.yaml',
] as const

export type DocsAiExportHeadingMode = 'normalize' | 'preserve'

export type DocsAiExportOrphans = 'append' | 'ignore'

export type DocsAiExportManifest = {
  canonical?: string
  description?: string
  exclude: string[]
  headingMode: DocsAiExportHeadingMode
  order: string[]
  orphans: DocsAiExportOrphans
  output?: string
  preamble?: string
  sourcePath: (typeof AI_MARKDOWN_EXPORT_MANIFEST_FILENAMES)[number] | string
  title?: string
  version: 1
}

export type DocsAiExportManifestInput = {
  canonical?: unknown
  description?: unknown
  exclude?: unknown
  headingMode?: unknown
  order?: unknown
  orphans?: unknown
  output?: unknown
  preamble?: unknown
  sourcePath?: unknown
  title?: unknown
  version?: unknown
}

export type DocsAiExportManifestValidationOptions = {
  knownDocsPaths?: Iterable<string>
  sourcePath?: string
}

export type DocsAiExportManifestValidationResult =
  | {
      issues: DocsValidationIssue[]
      manifest: DocsAiExportManifest
      ok: true
      warnings: DocsValidationIssue[]
    }
  | {
      issues: DocsValidationIssue[]
      ok: false
      warnings: DocsValidationIssue[]
    }

const createIssue = ({
  message,
  path,
}: {
  message: string
  path?: string
}): DocsValidationIssue => ({
  code: 'invalid_ai_export_manifest',
  message,
  path,
})

export const isAiMarkdownExportManifestPath = (sourcePath: string): boolean => {
  const normalized = sourcePath.split('\\').join('/').replace(/^\.?\//, '')

  return AI_MARKDOWN_EXPORT_MANIFEST_FILENAMES.includes(
    normalized as (typeof AI_MARKDOWN_EXPORT_MANIFEST_FILENAMES)[number],
  )
}

const trimComment = (value: string): string => {
  const commentIndex = value.search(/\s+#/)

  return commentIndex === -1 ? value : value.slice(0, commentIndex).trimEnd()
}

const unquote = (value: string): string => {
  const trimmed = trimComment(value.trim())

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }

  return trimmed
}

const parseScalar = (value: string): unknown => {
  const cleaned = unquote(value)

  if (/^-?\d+$/.test(cleaned)) {
    return Number(cleaned)
  }

  return cleaned
}

const parseInlineArray = (value: string): string[] | undefined => {
  const cleaned = trimComment(value.trim())

  if (!cleaned.startsWith('[') || !cleaned.endsWith(']')) {
    return undefined
  }

  const body = cleaned.slice(1, -1).trim()

  if (!body) {
    return []
  }

  return body.split(',').map((item) => unquote(item))
}

const keyLinePattern = /^([A-Za-z][A-Za-z0-9]*):(?:\s*(.*))?$/

const getTopLevelKeyLine = (
  line: string,
): { key: string; value: string } | undefined => {
  if (/^\s/.test(line)) {
    return undefined
  }

  const match = keyLinePattern.exec(line.trimEnd())

  if (!match) {
    return undefined
  }

  return {
    key: match[1] ?? '',
    value: match[2] ?? '',
  }
}

const stripCommonIndent = (lines: string[]): string[] => {
  const indents = lines
    .filter((line) => line.trim() !== '')
    .map((line) => line.match(/^ */)?.[0].length ?? 0)
  const commonIndent = indents.length > 0 ? Math.min(...indents) : 0

  return lines.map((line) => line.slice(commonIndent))
}

const stripOuterBlankLines = (lines: string[]): string[] => {
  const stripped = [...lines]

  while (stripped[0]?.trim() === '') {
    stripped.shift()
  }

  while (stripped.at(-1)?.trim() === '') {
    stripped.pop()
  }

  return stripped
}

const foldBlockLines = (lines: string[]): string => {
  const paragraphs: string[] = []
  let current: string[] = []

  for (const line of lines) {
    if (line.trim() === '') {
      if (current.length > 0) {
        paragraphs.push(current.join(' '))
        current = []
      }
      paragraphs.push('')
      continue
    }

    current.push(line.trim())
  }

  if (current.length > 0) {
    paragraphs.push(current.join(' '))
  }

  return paragraphs.join('\n').trim()
}

const collectBlock = ({
  lines,
  startIndex,
  style,
}: {
  lines: string[]
  startIndex: number
  style: '>' | '|'
}): {
  nextIndex: number
  value: string
} => {
  const blockLines: string[] = []
  let index = startIndex

  while (index < lines.length) {
    const line = lines[index] ?? ''

    if (getTopLevelKeyLine(line)) {
      break
    }

    blockLines.push(line)
    index += 1
  }

  const stripped = stripOuterBlankLines(stripCommonIndent(blockLines))

  return {
    nextIndex: index,
    value: style === '|' ? stripped.join('\n').trimEnd() : foldBlockLines(stripped),
  }
}

const collectList = ({
  lines,
  startIndex,
}: {
  lines: string[]
  startIndex: number
}): {
  nextIndex: number
  values?: string[]
} => {
  const values: string[] = []
  let index = startIndex
  let sawList = false

  while (index < lines.length) {
    const line = lines[index] ?? ''

    if (line.trim() === '') {
      index += 1
      continue
    }

    if (getTopLevelKeyLine(line)) {
      break
    }

    const match = /^\s*[-*]\s+(.+)$/.exec(line)

    if (!match) {
      break
    }

    sawList = true
    values.push(unquote(match[1] ?? ''))
    index += 1
  }

  return {
    nextIndex: sawList ? index : startIndex,
    values: sawList ? values : undefined,
  }
}

export const parseDocsAiExportManifestYaml = ({
  content,
  sourcePath,
}: {
  content: string
  sourcePath: string
}): DocsAiExportManifestValidationResult => {
  const parsed: Record<string, unknown> = {
    sourcePath,
  }
  const lines = content.replace(/\r\n?/g, '\n').split('\n')
  let index = 0

  while (index < lines.length) {
    const line = lines[index] ?? ''

    if (line.trim() === '' || line.trimStart().startsWith('#')) {
      index += 1
      continue
    }

    const keyLine = getTopLevelKeyLine(line)

    if (!keyLine) {
      return {
        issues: [
          createIssue({
            message: `Could not parse AI export manifest line: ${line.trim()}`,
            path: sourcePath,
          }),
        ],
        ok: false,
        warnings: [],
      }
    }

    const rawValue = keyLine.value.trim()

    if (rawValue === '|' || rawValue === '>') {
      const block = collectBlock({
        lines,
        startIndex: index + 1,
        style: rawValue,
      })

      parsed[keyLine.key] = block.value
      index = block.nextIndex
      continue
    }

    const inlineArray = parseInlineArray(rawValue)

    if (inlineArray) {
      parsed[keyLine.key] = inlineArray
      index += 1
      continue
    }

    if (rawValue === '') {
      const list = collectList({
        lines,
        startIndex: index + 1,
      })

      if (list.values) {
        parsed[keyLine.key] = list.values
        index = list.nextIndex
        continue
      }
    }

    parsed[keyLine.key] = parseScalar(rawValue)
    index += 1
  }

  return validateDocsAiExportManifest(parsed, {
    sourcePath,
  })
}

const getOptionalString = ({
  issues,
  key,
  manifest,
  path,
}: {
  issues: DocsValidationIssue[]
  key: keyof DocsAiExportManifestInput
  manifest: DocsAiExportManifestInput
  path?: string
}): string | undefined => {
  const value = manifest[key]

  if (value === undefined) {
    return undefined
  }

  if (typeof value === 'string') {
    return value.trim() === '' ? undefined : value
  }

  issues.push(
    createIssue({
      message: `AI export manifest field "${key}" must be a string.`,
      path,
    }),
  )

  return undefined
}

const getStringArray = ({
  issues,
  key,
  manifest,
  path,
}: {
  issues: DocsValidationIssue[]
  key: 'exclude' | 'order'
  manifest: DocsAiExportManifestInput
  path?: string
}): string[] => {
  const value = manifest[key]

  if (value === undefined) {
    return []
  }

  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
    return value
  }

  issues.push(
    createIssue({
      message: `AI export manifest field "${key}" must be a list of strings.`,
      path,
    }),
  )

  return []
}

const normalizeManifestDocsPath = ({
  issues,
  path,
  sourcePath,
}: {
  issues: DocsValidationIssue[]
  path: string
  sourcePath?: string
}): string | undefined => {
  const trimmed = path.trim().replace(/\\/g, '/').replace(/^\.\//, '')
  const normalized = normalizeDocsPath(trimmed)

  if (!normalized.ok) {
    issues.push(
      createIssue({
        message: `AI export manifest order path "${path}" is invalid: ${normalized.message}`,
        path: sourcePath,
      }),
    )
    return undefined
  }

  return normalized.path
}

const normalizeExcludePattern = ({
  issues,
  pattern,
  sourcePath,
}: {
  issues: DocsValidationIssue[]
  pattern: string
  sourcePath?: string
}): string | undefined => {
  const trimmed = pattern.trim().replace(/\\/g, '/').replace(/^\.\//, '')

  if (!trimmed || trimmed.includes('..') || trimmed.startsWith('/')) {
    issues.push(
      createIssue({
        message: `AI export manifest exclude pattern "${pattern}" is invalid.`,
        path: sourcePath,
      }),
    )
    return undefined
  }

  return trimmed
}

const normalizeRouteLikePath = (value: string | undefined): string | undefined => {
  if (!value) {
    return undefined
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    return value
  }

  return normalizeRoutePath(value)
}

export const validateDocsAiExportManifest = (
  manifest: unknown,
  options: DocsAiExportManifestValidationOptions = {},
): DocsAiExportManifestValidationResult => {
  const issues: DocsValidationIssue[] = []
  const warnings: DocsValidationIssue[] = []
  const sourcePath =
    options.sourcePath ??
    (typeof (manifest as DocsAiExportManifestInput | undefined)?.sourcePath === 'string'
      ? String((manifest as DocsAiExportManifestInput).sourcePath)
      : AI_MARKDOWN_EXPORT_MANIFEST_FILENAMES[0])

  if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) {
    return {
      issues: [
        createIssue({
          message: 'AI export manifest must be an object.',
          path: sourcePath,
        }),
      ],
      ok: false,
      warnings,
    }
  }

  const input = manifest as DocsAiExportManifestInput

  if (input.version !== 1) {
    issues.push(
      createIssue({
        message: 'AI export manifest version must be 1.',
        path: sourcePath,
      }),
    )
  }

  const orphans =
    input.orphans === undefined
      ? 'append'
      : input.orphans === 'append' || input.orphans === 'ignore'
        ? input.orphans
        : undefined

  if (!orphans) {
    issues.push(
      createIssue({
        message: 'AI export manifest orphans must be "append" or "ignore".',
        path: sourcePath,
      }),
    )
  }

  const headingMode =
    input.headingMode === undefined
      ? 'normalize'
      : input.headingMode === 'normalize' || input.headingMode === 'preserve'
        ? input.headingMode
        : undefined

  if (!headingMode) {
    issues.push(
      createIssue({
        message:
          'AI export manifest headingMode must be "normalize" or "preserve".',
        path: sourcePath,
      }),
    )
  }

  const order = getStringArray({
    issues,
    key: 'order',
    manifest: input,
    path: sourcePath,
  })
    .map((item) =>
      normalizeManifestDocsPath({
        issues,
        path: item,
        sourcePath,
      }),
    )
    .filter((item): item is string => item !== undefined)
  const exclude = getStringArray({
    issues,
    key: 'exclude',
    manifest: input,
    path: sourcePath,
  })
    .map((item) =>
      normalizeExcludePattern({
        issues,
        pattern: item,
        sourcePath,
      }),
    )
    .filter((item): item is string => item !== undefined)
  const knownDocsPaths = options.knownDocsPaths
    ? new Set(options.knownDocsPaths)
    : undefined

  if (knownDocsPaths) {
    for (const orderedPath of order) {
      if (!knownDocsPaths.has(orderedPath)) {
        warnings.push({
          code: 'missing_ai_export_order_path',
          message: `AI export manifest order path "${orderedPath}" does not exist in the docs files.`,
          path: sourcePath,
        })
      }
    }
  }

  const title = getOptionalString({
    issues,
    key: 'title',
    manifest: input,
    path: sourcePath,
  })
  const canonical = normalizeRouteLikePath(
    getOptionalString({
      issues,
      key: 'canonical',
      manifest: input,
      path: sourcePath,
    }),
  )
  const output = normalizeRouteLikePath(
    getOptionalString({
      issues,
      key: 'output',
      manifest: input,
      path: sourcePath,
    }),
  )
  const description = getOptionalString({
    issues,
    key: 'description',
    manifest: input,
    path: sourcePath,
  })
  const preamble = getOptionalString({
    issues,
    key: 'preamble',
    manifest: input,
    path: sourcePath,
  })

  if (issues.length > 0 || !orphans || !headingMode) {
    return {
      issues,
      ok: false,
      warnings,
    }
  }

  return {
    issues,
    manifest: {
      ...(canonical ? { canonical } : {}),
      ...(description ? { description } : {}),
      exclude,
      headingMode,
      order,
      orphans,
      ...(output ? { output } : {}),
      ...(preamble ? { preamble } : {}),
      sourcePath,
      ...(title ? { title } : {}),
      version: 1,
    },
    ok: true,
    warnings,
  }
}

const escapeRegex = (value: string): string =>
  value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&')

const globPatternToRegex = (pattern: string): RegExp => {
  let regex = '^'

  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index]
    const next = pattern[index + 1]

    if (char === '*' && next === '*') {
      regex += '.*'
      index += 1
      continue
    }

    if (char === '*') {
      regex += '[^/]*'
      continue
    }

    regex += escapeRegex(char ?? '')
  }

  return new RegExp(`${regex}$`)
}

export const matchesAiExportExcludePattern = ({
  pattern,
  sourcePath,
}: {
  pattern: string
  sourcePath: string
}): boolean => {
  const normalizedPattern = pattern.replace(/^\.\//, '')
  const normalizedSourcePath = sourcePath.replace(/^\.\//, '')

  if (!normalizedPattern.includes('*')) {
    return normalizedPattern === normalizedSourcePath
  }

  return globPatternToRegex(normalizedPattern).test(normalizedSourcePath)
}

export const isExcludedFromAiExport = ({
  exclude,
  sourcePath,
}: {
  exclude: string[]
  sourcePath: string
}): boolean =>
  isAiMarkdownExportManifestPath(sourcePath) ||
  exclude.some((pattern) =>
    matchesAiExportExcludePattern({
      pattern,
      sourcePath,
    }),
  )

