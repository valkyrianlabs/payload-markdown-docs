import type { DocsValidationIssue } from './validate.js'

import { normalizeDocsPath } from './paths.js'

export type DocsFrontmatter = {
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

const arrayFrontmatterFields = new Set(['redirectFrom', 'tags'])

const stripQuotes = (value: string): string => {
  const trimmed = value.trim()

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
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

const isFrontmatterKey = (value: string): boolean => {
  const firstCharacter = value.charCodeAt(0)
  const startsWithLetter =
    (firstCharacter >= 65 && firstCharacter <= 90) ||
    (firstCharacter >= 97 && firstCharacter <= 122)

  if (!startsWithLetter) {
    return false
  }

  return [...value].every((character) => {
    const code = character.charCodeAt(0)

    return (
      (code >= 48 && code <= 57) ||
      (code >= 65 && code <= 90) ||
      (code >= 97 && code <= 122)
    )
  })
}

const assignFrontmatterValue = ({
  frontmatter,
  key,
  path,
  rawValue,
}: {
  frontmatter: DocsFrontmatter
  key: string
  path?: string
  rawValue: string
}): DocsValidationIssue | undefined => {
  const value = stripQuotes(rawValue)

  switch (key) {
    case 'description':
    case 'navTitle':
    case 'slug':
    case 'title':
      frontmatter[key] = value
      return undefined

    case 'draft':
      if (value === 'true' || value === 'false') {
        frontmatter.draft = value === 'true'
        return undefined
      }

      return createFrontmatterIssue({
        message: 'Frontmatter field "draft" must be a boolean.',
        path,
      })

    case 'order': {
      const order = Number(value)

      if (Number.isFinite(order)) {
        frontmatter.order = order
        return undefined
      }

      return createFrontmatterIssue({
        message: 'Frontmatter field "order" must be a number.',
        path,
      })
    }

    case 'status':
      if (value === 'draft' || value === 'published') {
        frontmatter.status = value
        return undefined
      }

      return createFrontmatterIssue({
        message: 'Frontmatter field "status" must be "draft" or "published".',
        path,
      })

    default:
      return undefined
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

export const parseDocsFrontmatter = (
  markdown: string,
  options: {
    path?: string
  } = {},
): ParseDocsFrontmatterResult => {
  const issues: DocsValidationIssue[] = []
  const warnings: DocsValidationIssue[] = []

  if (!markdown.startsWith('---\n') && !markdown.startsWith('---\r\n')) {
    return {
      content: markdown,
      frontmatter: {},
      issues,
      warnings,
    }
  }

  const lines = markdown.split(/\r?\n/)
  const closingIndex = lines.findIndex((line, index) => index > 0 && line.trim() === '---')

  if (closingIndex === -1) {
    return {
      content: markdown,
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
  let currentArrayKey: 'redirectFrom' | 'tags' | undefined

  for (const line of frontmatterLines) {
    if (line.trim() === '') {
      continue
    }

    const trimmedStart = line.trimStart()

    if (trimmedStart.startsWith('- ')) {
      if (!currentArrayKey) {
        issues.push(
          createFrontmatterIssue({
            message: 'Frontmatter array item does not belong to a supported array field.',
            path: options.path,
          }),
        )
        continue
      }

      frontmatter[currentArrayKey] = [
        ...(frontmatter[currentArrayKey] ?? []),
        stripQuotes(trimmedStart.slice(2)),
      ]
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
      currentArrayKey = undefined
      continue
    }

    currentArrayKey = undefined

    if (!knownFrontmatterFields.has(key)) {
      warnings.push({
        code: 'invalid_frontmatter',
        message: `Unknown frontmatter field "${key}" was ignored.`,
        path: options.path,
      })
      continue
    }

    if (arrayFrontmatterFields.has(key)) {
      if (rawValue.trim() !== '') {
        issues.push(
          createFrontmatterIssue({
            message: `Frontmatter field "${key}" must use list item syntax.`,
            path: options.path,
          }),
        )
        continue
      }

      currentArrayKey = key as 'redirectFrom' | 'tags'
      frontmatter[currentArrayKey] = []
      continue
    }

    const issue = assignFrontmatterValue({
      frontmatter,
      key,
      path: options.path,
      rawValue,
    })

    if (issue) {
      issues.push(issue)
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

export const inferTitleFromMarkdown = (content: string): string | undefined => {
  const h1Line = content
    .split(/\r?\n/)
    .find((line) => /^#\s+[^#]/.test(line.trim()))

  return h1Line?.replace(/^#\s+/, '').replace(/\s+#*$/, '').trim() || undefined
}

export const titleFromSourcePath = (sourcePath: string): string => {
  const normalizedPath = normalizeDocsPath(sourcePath)

  if (!normalizedPath.ok) {
    return 'Untitled'
  }

  const pathSegments = normalizedPath.path.split('/')
  const lastSegment = pathSegments.at(-1) ?? 'index.md'
  const baseName = lastSegment === 'index.md' ? pathSegments.at(-2) ?? 'index' : lastSegment
  const withoutExtension = baseName.replace(/\.md$/, '')

  return withoutExtension
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ')
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
  frontmatter.title ?? inferTitleFromMarkdown(content) ?? titleFromSourcePath(sourcePath)
