import type { DocsValidationIssue } from './validate.js'

import { normalizeDocsPath } from './paths.js'
import { splitMarkdownLines, stripByteOrderMark } from './text.js'
import { inferTitleFromMarkdown } from './title.js'

export { inferTitleFromMarkdown, stripInlineMarkdown } from './title.js'

export type DocsFrontmatter = {
  dependencies?: string[]
  description?: string
  draft?: boolean
  navTitle?: string
  order?: number
  redirectFrom?: string[]
  slug?: string
  status?: 'draft' | 'published'
  tags?: string[]
  title?: string
}

export type ParseDocsFrontmatterResult = {
  content: string
  frontmatter: DocsFrontmatter
  issues: DocsValidationIssue[]
  warnings: DocsValidationIssue[]
}

const knownFrontmatterFields = new Set([
  'dependencies',
  'description',
  'draft',
  'navTitle',
  'order',
  'redirectFrom',
  'slug',
  'status',
  'tags',
  'title',
])

const arrayFrontmatterFields = new Set(['dependencies', 'redirectFrom', 'tags'])

const stripQuotes = (value: string): string => {
  const trimmed = value.trim()

  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1)
  }

  return trimmed
}

const createFrontmatterIssue = ({
  message,
  path,
}: {
  message: string
  path?: string
}): DocsValidationIssue => ({
  code: 'invalid_frontmatter',
  message,
  path,
})

const isAsciiLetterCode = (code: number): boolean =>
  (code >= 65 && code <= 90) || (code >= 97 && code <= 122)

const isAsciiDigitCode = (code: number): boolean => code >= 48 && code <= 57

/** Keys are `[A-Za-z_][A-Za-z0-9_-]*`; anything else is not a supported line. */
const isFrontmatterKey = (value: string): boolean => {
  if (value === '') {
    return false
  }

  const firstCharacter = value.charCodeAt(0)

  if (!isAsciiLetterCode(firstCharacter) && firstCharacter !== 95) {
    return false
  }

  for (let index = 1; index < value.length; index += 1) {
    const code = value.charCodeAt(index)

    if (!isAsciiLetterCode(code) && !isAsciiDigitCode(code) && code !== 95 && code !== 45) {
      return false
    }
  }

  return true
}

const isBlockScalarIndicator = (value: string): boolean => /^[|>][-+0-9]*$/.test(value)

/**
 * Parses a single-line YAML flow sequence (`[a, "b, c", 'd']`). Nested
 * collections are not supported. Returns undefined for invalid input.
 */
const parseFlowSequence = (value: string): string[] | undefined => {
  if (!value.startsWith('[') || !value.endsWith(']')) {
    return undefined
  }

  const inner = value.slice(1, -1)

  if (inner.trim() === '') {
    return []
  }

  const items: string[] = []
  let current = ''
  let quote: string | undefined

  for (const character of inner) {
    if (quote) {
      current += character

      if (character === quote) {
        quote = undefined
      }

      continue
    }

    if ((character === '"' || character === "'") && current.trim() === '') {
      quote = character
      current += character
      continue
    }

    if (character === '[' || character === ']' || character === '{' || character === '}') {
      return undefined
    }

    if (character === ',') {
      items.push(current)
      current = ''
      continue
    }

    current += character
  }

  if (quote) {
    return undefined
  }

  items.push(current)

  if (items.length > 1 && (items.at(-1) ?? '').trim() === '') {
    items.pop()
  }

  if (items.some((item) => item.trim() === '')) {
    return undefined
  }

  return items.map(stripQuotes)
}

type ScalarFrontmatterField = 'description' | 'draft' | 'navTitle' | 'order' | 'slug' | 'status' | 'title'

const assignFrontmatterValue = ({
  frontmatter,
  key,
  path,
  rawValue,
}: {
  frontmatter: DocsFrontmatter
  key: ScalarFrontmatterField
  path?: string
  rawValue: string
}): {
  issue?: DocsValidationIssue
  warning?: DocsValidationIssue
} => {
  const value = stripQuotes(rawValue)

  switch (key) {
    case 'description':
    case 'navTitle':
      frontmatter[key] = value
      return {}

    case 'draft':
      if (value === 'true' || value === 'false') {
        frontmatter.draft = value === 'true'
        return {}
      }

      return {
        issue: createFrontmatterIssue({
          message: 'Frontmatter field "draft" must be a boolean.',
          path,
        }),
      }

    case 'order': {
      // ECMAScript Number() semantics: decimal, 0x/0o/0b integers; blank is 0.
      const order = Number(value)

      if (Number.isFinite(order)) {
        frontmatter.order = order

        return value.trim() === ''
          ? {
              warning: createFrontmatterIssue({
                message: 'Frontmatter field "order" is empty and was treated as 0.',
                path,
              }),
            }
          : {}
      }

      return {
        issue: createFrontmatterIssue({
          message: 'Frontmatter field "order" must be a number.',
          path,
        }),
      }
    }

    case 'slug':
      frontmatter.slug = value

      return value === ''
        ? {
            warning: createFrontmatterIssue({
              message: 'Frontmatter field "slug" is empty and was ignored.',
              path,
            }),
          }
        : {}

    case 'status':
      if (value === 'draft' || value === 'published') {
        frontmatter.status = value
        return {}
      }

      return {
        issue: createFrontmatterIssue({
          message: 'Frontmatter field "status" must be "draft" or "published".',
          path,
        }),
      }

    case 'title':
      frontmatter.title = value

      return value === ''
        ? {
            warning: createFrontmatterIssue({
              message: 'Frontmatter field "title" is empty; the title is inferred instead.',
              path,
            }),
          }
        : {}
  }
}

const validateParsedFrontmatter = (
  frontmatter: DocsFrontmatter,
  path?: string,
): DocsValidationIssue[] => {
  const issues: DocsValidationIssue[] = []

  if (frontmatter.slug && !/^[a-z0-9][a-z0-9-]*$/i.test(frontmatter.slug)) {
    issues.push(
      createFrontmatterIssue({
        message:
          'Frontmatter field "slug" must contain only letters, numbers, and hyphens.',
        path,
      }),
    )
  }

  return issues
}

type FrontmatterContext =
  | {
      key: 'dependencies' | 'redirectFrom' | 'tags'
      kind: 'array'
    }
  | {
      key: string
      kind: 'ignored'
    }
  | {
      key: string
      kind: 'scalar'
    }
  | {
      kind: 'none'
    }

/**
 * Parses the supported YAML frontmatter subset (see `docs/reference/frontmatter.md`
 * and `contracts/README.md`):
 *
 * - an optional UTF-8 BOM, then `---` on the first line and a closing `---`;
 * - top-level `key: value` lines with keys matching `[A-Za-z_][A-Za-z0-9_-]*`;
 * - list fields as `- item` lines or a single-line flow list `[a, b]`;
 * - full-line `#` comments.
 *
 * Unknown keys (and anything nested below them) are ignored with a warning.
 * Nested values, multi-line values and block scalars on known fields are
 * reported as issues instead of silently changing other fields.
 */
export const parseDocsFrontmatter = (
  markdown: string,
  options: {
    path?: string
  } = {},
): ParseDocsFrontmatterResult => {
  const issues: DocsValidationIssue[] = []
  const warnings: DocsValidationIssue[] = []
  const source = stripByteOrderMark(markdown)
  const lines = splitMarkdownLines(source)

  if (lines.length < 2 || lines[0] !== '---') {
    return {
      content: source,
      frontmatter: {},
      issues,
      warnings,
    }
  }

  const closingIndex = lines.findIndex((line, index) => index > 0 && line.trim() === '---')

  if (closingIndex === -1) {
    return {
      content: source,
      frontmatter: {},
      issues: [
        createFrontmatterIssue({
          message: 'Frontmatter block is missing a closing delimiter.',
          path: options.path,
        }),
      ],
      warnings,
    }
  }

  const frontmatter: DocsFrontmatter = {}
  const frontmatterLines = lines.slice(1, closingIndex)
  let context: FrontmatterContext = { kind: 'none' }

  for (const line of frontmatterLines) {
    if (line.trim() === '') {
      continue
    }

    const trimmedStart = line.trimStart()
    const indented = trimmedStart.length !== line.length

    if (trimmedStart.startsWith('#')) {
      continue
    }

    if (trimmedStart.startsWith('- ')) {
      if (context.kind === 'array') {
        frontmatter[context.key] = [
          ...(frontmatter[context.key] ?? []),
          stripQuotes(trimmedStart.slice(2)),
        ]
        continue
      }

      if (context.kind === 'ignored') {
        continue
      }

      issues.push(
        createFrontmatterIssue({
          message: 'Frontmatter array item does not belong to a supported array field.',
          path: options.path,
        }),
      )
      continue
    }

    if (indented) {
      if (context.kind === 'ignored') {
        continue
      }

      if (context.kind === 'array' || context.kind === 'scalar') {
        issues.push(
          createFrontmatterIssue({
            message:
              context.kind === 'array'
                ? `Frontmatter field "${context.key}" only supports "- item" list entries.`
                : `Frontmatter field "${context.key}" does not support nested or multi-line values.`,
            path: options.path,
          }),
        )
        context = { key: context.key, kind: 'ignored' }
        continue
      }

      issues.push(
        createFrontmatterIssue({
          message: `Unsupported indented frontmatter line: ${line}`,
          path: options.path,
        }),
      )
      continue
    }

    const separatorIndex = line.indexOf(':')
    const key = separatorIndex > 0 ? line.slice(0, separatorIndex).trim() : ''
    const rawValue = separatorIndex > 0 ? line.slice(separatorIndex + 1).trim() : ''

    if (!isFrontmatterKey(key)) {
      issues.push(
        createFrontmatterIssue({
          message: `Unsupported frontmatter line: ${line}`,
          path: options.path,
        }),
      )
      context = { kind: 'none' }
      continue
    }

    if (!knownFrontmatterFields.has(key)) {
      warnings.push({
        code: 'invalid_frontmatter',
        message: `Unknown frontmatter field "${key}" was ignored.`,
        path: options.path,
      })
      context = { key, kind: 'ignored' }
      continue
    }

    if (arrayFrontmatterFields.has(key)) {
      const arrayKey = key as 'dependencies' | 'redirectFrom' | 'tags'

      if (rawValue === '') {
        context = { key: arrayKey, kind: 'array' }
        frontmatter[arrayKey] = []
        continue
      }

      context = { key, kind: 'ignored' }

      if (rawValue.startsWith('[')) {
        const items = parseFlowSequence(rawValue)

        if (items) {
          frontmatter[arrayKey] = items
          continue
        }

        issues.push(
          createFrontmatterIssue({
            message: `Frontmatter field "${key}" has an invalid flow list; use [a, b] or "- item" lines.`,
            path: options.path,
          }),
        )
        continue
      }

      issues.push(
        createFrontmatterIssue({
          message: `Frontmatter field "${key}" must use list item syntax.`,
          path: options.path,
        }),
      )
      continue
    }

    if (isBlockScalarIndicator(rawValue)) {
      issues.push(
        createFrontmatterIssue({
          message: `Frontmatter field "${key}" uses a YAML block scalar (${rawValue}), which is not supported; use a single-line value.`,
          path: options.path,
        }),
      )
      context = { key, kind: 'ignored' }
      continue
    }

    context = { key, kind: 'scalar' }

    const result = assignFrontmatterValue({
      frontmatter,
      key: key as ScalarFrontmatterField,
      path: options.path,
      rawValue,
    })

    if (result.issue) {
      issues.push(result.issue)
    }

    if (result.warning) {
      warnings.push(result.warning)
    }
  }

  issues.push(...validateParsedFrontmatter(frontmatter, options.path))

  return {
    content: lines.slice(closingIndex + 1).join('\n').replace(/^\n/, ''),
    frontmatter,
    issues,
    warnings,
  }
}

export const titleFromSourcePath = (sourcePath: string): string => {
  const normalizedPath = normalizeDocsPath(sourcePath)

  if (!normalizedPath.ok) {
    return 'Untitled'
  }

  const pathSegments = normalizedPath.path.split('/')
  const lastSegment = pathSegments.at(-1) ?? 'index.md'
  const baseName =
    lastSegment.toLowerCase() === 'index.md' ? pathSegments.at(-2) ?? 'index' : lastSegment
  const withoutExtension = baseName.replace(/\.md$/, '')

  // Only the first UTF-16 code unit is upper-cased (astral characters are left
  // as-is); the native CLI mirrors this with a generated BMP case table.
  const title = withoutExtension
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ')

  return title === '' ? 'Untitled' : title
}

export const resolveDocsTitle = ({
  content,
  frontmatter,
  sourcePath,
}: {
  content: string
  frontmatter: DocsFrontmatter
  sourcePath: string
}): string =>
  (frontmatter.title !== undefined && frontmatter.title !== '' ? frontmatter.title : undefined) ??
  inferTitleFromMarkdown(content) ??
  titleFromSourcePath(sourcePath)
