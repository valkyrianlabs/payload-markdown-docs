/**
 * Project metadata: the optional manifest `project` object that `pmdocs` builds from
 * `docs/stack.toml` (title, description and a categorized technology stack).
 *
 * The C++ twin is `validate_project` in `cli/src/sync_contract.cpp`; the shared vectors
 * in `contracts/vectors/project.json` pin both. Issue paths name `stack.toml` keys so one
 * message serves the CLI and the sync response.
 */
import { isControlCharacterCode } from './text.js'

export type DocsProjectStackItem = {
  name: string
}

export type DocsProjectStackCategory = {
  category: string
  items: DocsProjectStackItem[]
}

/**
 * Normalized project metadata. A missing `stack` means "leave the stored stack alone";
 * missing `title` / `description` never blank the docs set's fields.
 */
export type DocsProjectMetadata = {
  description?: string
  stack?: DocsProjectStackCategory[]
  title?: string
}

export type DocsProjectIssueCode =
  | 'duplicate_stack_category'
  | 'duplicate_stack_item'
  | 'empty_stack_category'
  | 'invalid_project'
  | 'invalid_project_description'
  | 'invalid_project_title'
  | 'invalid_stack'
  | 'invalid_stack_category'
  | 'invalid_stack_item'
  | 'stack_limit_exceeded'
  | 'unknown_project_field'

export type DocsProjectIssue = {
  code: DocsProjectIssueCode
  message: string
  path: string
}

export type DocsProjectValidationResult =
  | { issues: DocsProjectIssue[]; ok: false; warnings: DocsProjectIssue[] }
  | { issues: DocsProjectIssue[]; ok: true; project: DocsProjectMetadata; warnings: DocsProjectIssue[] }

export const DOCS_PROJECT_LIMITS = {
  maxCategories: 32,
  maxCategoryBytes: 64,
  maxDescriptionBytes: 2048,
  maxItems: 256,
  maxItemsPerCategory: 64,
  maxNameBytes: 128,
  maxTitleBytes: 256,
} as const

const CATEGORY_PATTERN = /^[A-Z0-9][\w-]*$/i
const PROJECT_KEYS = new Set(['description', 'stack', 'title'])
const CATEGORY_KEYS = new Set(['category', 'items'])
const ITEM_KEYS = new Set(['name'])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const byteLength = (value: string): number => Buffer.byteLength(value, 'utf8')

const hasControlCharacter = (value: string, allowed: Set<number> = new Set()): boolean => {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0

    if (isControlCharacterCode(code) && !allowed.has(code)) {
      return true
    }
  }

  return false
}

/** ASCII-only case folding, so the comparison is identical in C++. */
const asciiLower = (value: string): string => value.replace(/[A-Z]/g, (c) => c.toLowerCase())

const DESCRIPTION_ALLOWED_CONTROLS = new Set([0x09, 0x0a])

const checkText = ({
  allowed,
  maxBytes,
  value,
}: {
  allowed?: Set<number>
  maxBytes: number
  value: unknown
}): { error: string } | { value: string } => {
  if (typeof value !== 'string') {
    return { error: 'must be a string (remove the key to leave it unset)' }
  }

  const normalized = allowed ? value.replace(/\r\n|\r/g, '\n').trim() : value.trim()

  if (normalized === '') {
    return { error: 'must not be blank (remove the key to leave it unset)' }
  }

  if (hasControlCharacter(normalized, allowed)) {
    return {
      error: allowed
        ? 'must not contain control characters other than tab and newline'
        : 'must be a single line without control characters',
    }
  }

  if (byteLength(normalized) > maxBytes) {
    return { error: `must be at most ${maxBytes} UTF-8 bytes` }
  }

  return { value: normalized }
}

export const validateDocsProjectMetadata = (input: unknown): DocsProjectValidationResult => {
  const issues: DocsProjectIssue[] = []
  const warnings: DocsProjectIssue[] = []
  const issue = (code: DocsProjectIssueCode, path: string, message: string) =>
    issues.push({ code, message, path })
  const warn = (code: DocsProjectIssueCode, path: string, message: string) =>
    warnings.push({ code, message, path })

  if (!isRecord(input)) {
    issue(
      'invalid_project',
      'project',
      'Project metadata must be an object ([project] and [stack] tables in stack.toml).',
    )

    return { issues, ok: false, warnings }
  }

  for (const key of Object.keys(input)) {
    if (!PROJECT_KEYS.has(key)) {
      warn('unknown_project_field', `project.${key}`, `Unknown project field "${key}" is ignored.`)
    }
  }

  const project: DocsProjectMetadata = {}

  if (input.title !== undefined) {
    const title = checkText({ maxBytes: DOCS_PROJECT_LIMITS.maxTitleBytes, value: input.title })

    if ('error' in title) {
      issue('invalid_project_title', 'project.title', `project.title ${title.error}.`)
    } else {
      project.title = title.value
    }
  }

  if (input.description !== undefined) {
    const description = checkText({
      allowed: DESCRIPTION_ALLOWED_CONTROLS,
      maxBytes: DOCS_PROJECT_LIMITS.maxDescriptionBytes,
      value: input.description,
    })

    if ('error' in description) {
      issue('invalid_project_description', 'project.description', `project.description ${description.error}.`)
    } else {
      project.description = description.value
    }
  }

  if (input.stack !== undefined) {
    const stack = validateStack(input.stack, issue, warn)

    if (stack) {
      project.stack = stack
    }
  }

  if (issues.length > 0) {
    return { issues, ok: false, warnings }
  }

  return { issues, ok: true, project, warnings }
}

type Report = (code: DocsProjectIssueCode, path: string, message: string) => void

const validateStack = (
  input: unknown,
  issue: Report,
  warn: Report,
): DocsProjectStackCategory[] | undefined => {
  if (!Array.isArray(input)) {
    issue(
      'invalid_stack',
      'stack',
      'stack must be a table of categories, for example [[stack.languages]] with name = "C++".',
    )

    return undefined
  }

  if (input.length > DOCS_PROJECT_LIMITS.maxCategories) {
    issue(
      'stack_limit_exceeded',
      'stack',
      `stack has ${input.length} categories; the limit is ${DOCS_PROJECT_LIMITS.maxCategories}.`,
    )
  }

  const stack: DocsProjectStackCategory[] = []
  const seenCategories = new Set<string>()
  let totalItems = 0

  input.forEach((entry, index) => {
    if (!isRecord(entry)) {
      issue('invalid_stack_category', `stack[${index}]`, `stack[${index}] must be a category object.`)

      return
    }

    const key = entry.category

    if (
      typeof key !== 'string' ||
      !CATEGORY_PATTERN.test(key) ||
      byteLength(key) > DOCS_PROJECT_LIMITS.maxCategoryBytes
    ) {
      issue(
        'invalid_stack_category',
        `stack[${index}]`,
        `Category ${JSON.stringify(key)} must be a key of letters, digits, "-" and "_" that starts with a letter or digit (at most ${DOCS_PROJECT_LIMITS.maxCategoryBytes} bytes), for example machine-learning.`,
      )

      return
    }

    const path = `stack.${key}`

    for (const field of Object.keys(entry)) {
      if (!CATEGORY_KEYS.has(field)) {
        warn('unknown_project_field', `${path}.${field}`, `Unknown category field "${field}" is ignored.`)
      }
    }

    const folded = asciiLower(key)

    if (seenCategories.has(folded)) {
      issue(
        'duplicate_stack_category',
        path,
        `Category "${key}" is listed more than once (category names are case-insensitive); merge the entries.`,
      )

      return
    }

    seenCategories.add(folded)

    if (!Array.isArray(entry.items)) {
      issue(
        'invalid_stack_category',
        path,
        `${path} must be an array of tables, for example [[${path}]] with name = "...".`,
      )

      return
    }

    if (entry.items.length > DOCS_PROJECT_LIMITS.maxItemsPerCategory) {
      issue(
        'stack_limit_exceeded',
        path,
        `${path} has ${entry.items.length} technologies; the limit is ${DOCS_PROJECT_LIMITS.maxItemsPerCategory}.`,
      )
    }

    totalItems += entry.items.length

    const items: DocsProjectStackItem[] = []
    const seenNames = new Set<string>()

    entry.items.forEach((item: unknown, itemIndex: number) => {
      const itemPath = `${path}[${itemIndex}]`

      if (!isRecord(item)) {
        issue('invalid_stack_item', itemPath, `${itemPath} must be a table with a name.`)

        return
      }

      for (const field of Object.keys(item)) {
        if (!ITEM_KEYS.has(field)) {
          warn('unknown_project_field', `${itemPath}.${field}`, `Unknown technology field "${field}" is ignored.`)
        }
      }

      const name = checkText({ maxBytes: DOCS_PROJECT_LIMITS.maxNameBytes, value: item.name })

      if ('error' in name) {
        issue('invalid_stack_item', `${itemPath}.name`, `${itemPath}.name is required and ${name.error}.`)

        return
      }

      const foldedName = asciiLower(name.value)

      if (seenNames.has(foldedName)) {
        issue(
          'duplicate_stack_item',
          `${itemPath}.name`,
          `"${name.value}" is listed more than once in ${path} (names are case-insensitive); remove the duplicate.`,
        )

        return
      }

      seenNames.add(foldedName)
      items.push({ name: name.value })
    })

    if (entry.items.length === 0) {
      warn('empty_stack_category', path, `Category "${key}" has no technologies and is ignored.`)

      return
    }

    stack.push({ category: key, items })
  })

  if (totalItems > DOCS_PROJECT_LIMITS.maxItems) {
    issue(
      'stack_limit_exceeded',
      'stack',
      `stack lists ${totalItems} technologies; the limit is ${DOCS_PROJECT_LIMITS.maxItems}.`,
    )
  }

  return stack
}
