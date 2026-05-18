import type { DocsValidationErrorCode } from './validate.js'

export type NormalizeDocsPathResult =
  | {
      code: DocsValidationErrorCode
      message: string
      ok: false
    }
  | {
      ok: true
      path: string
      routeSegments: string[]
    }

export type NormalizeAssetPathResult =
  | {
      code: DocsValidationErrorCode
      message: string
      ok: false
    }
  | {
      ok: true
      path: string
      segments: string[]
    }

const trimLeadingCurrentDirectory = (path: string): string => {
  let nextPath = path

  while (nextPath.startsWith('./')) {
    nextPath = nextPath.slice(2)
  }

  return nextPath
}

export const normalizeAssetPath = (input: string): NormalizeAssetPathResult => {
  if (typeof input !== 'string' || input.trim() === '') {
    return {
      code: 'invalid_path',
      message: 'Asset path must be a non-empty string.',
      ok: false,
    }
  }

  const trimmedInput = input.trim()

  if (/^[a-z]:[\\/]/i.test(trimmedInput)) {
    return {
      code: 'invalid_path',
      message: 'Asset path must not be an absolute Windows path.',
      ok: false,
    }
  }

  if (trimmedInput.startsWith('/')) {
    return {
      code: 'invalid_path',
      message: 'Asset path must not be an absolute path.',
      ok: false,
    }
  }

  const normalizedPath = trimLeadingCurrentDirectory(
    trimmedInput.replace(/\\/g, '/').replace(/\/+/g, '/'),
  )

  if (normalizedPath === '' || normalizedPath.endsWith('/')) {
    return {
      code: 'invalid_path',
      message: 'Asset path must point to a file.',
      ok: false,
    }
  }

  const segments = normalizedPath.split('/')

  if (segments.some((segment) => segment === '..')) {
    return {
      code: 'path_traversal',
      message: 'Asset path must not contain path traversal segments.',
      ok: false,
    }
  }

  if (segments.some((segment) => segment === '' || segment === '.')) {
    return {
      code: 'invalid_path',
      message: 'Asset path contains an invalid path segment.',
      ok: false,
    }
  }

  return {
    ok: true,
    path: normalizedPath,
    segments,
  }
}

export const normalizeDocsPath = (input: string): NormalizeDocsPathResult => {
  if (typeof input !== 'string' || input.trim() === '') {
    return {
      code: 'invalid_path',
      message: 'Docs path must be a non-empty string.',
      ok: false,
    }
  }

  const trimmedInput = input.trim()

  if (/^[a-z]:[\\/]/i.test(trimmedInput)) {
    return {
      code: 'invalid_path',
      message: 'Docs path must not be an absolute Windows path.',
      ok: false,
    }
  }

  if (trimmedInput.startsWith('/')) {
    return {
      code: 'invalid_path',
      message: 'Docs path must not be an absolute path.',
      ok: false,
    }
  }

  const normalizedPath = trimLeadingCurrentDirectory(
    trimmedInput.replace(/\\/g, '/').replace(/\/+/g, '/'),
  )

  if (normalizedPath === '' || normalizedPath.endsWith('/')) {
    return {
      code: 'invalid_path',
      message: 'Docs path must point to a Markdown file.',
      ok: false,
    }
  }

  const segments = normalizedPath.split('/')

  if (segments.some((segment) => segment === '..')) {
    return {
      code: 'path_traversal',
      message: 'Docs path must not contain path traversal segments.',
      ok: false,
    }
  }

  if (segments.some((segment) => segment === '' || segment === '.')) {
    return {
      code: 'invalid_path',
      message: 'Docs path contains an invalid path segment.',
      ok: false,
    }
  }

  if (!normalizedPath.endsWith('.md')) {
    return {
      code: 'non_markdown_file',
      message: 'Docs path must end in .md.',
      ok: false,
    }
  }

  const fileName = segments.at(-1)

  if (!fileName || fileName === '.md') {
    return {
      code: 'invalid_path',
      message: 'Docs path must include a Markdown filename.',
      ok: false,
    }
  }

  const routeSegments = segments.map((segment, index) => {
    if (index === segments.length - 1) {
      return segment.slice(0, -'.md'.length)
    }

    return segment
  })

  if (routeSegments.at(-1)?.toLowerCase() === 'index') {
    routeSegments.pop()
  }

  return {
    ok: true,
    path: normalizedPath,
    routeSegments,
  }
}

const normalizeRouteBase = (routeBase: string): string => {
  const normalized = `/${routeBase.trim()}`.replace(/\\/g, '/').replace(/\/+/g, '/')
  const withoutTrailingSlash =
    normalized.length > 1 ? normalized.replace(/\/+$/g, '') : normalized

  return withoutTrailingSlash || '/'
}

const normalizeRoutePath = (routePath: string): string => {
  const normalized = `/${routePath.trim()}`.replace(/\\/g, '/').replace(/\/+/g, '/')
  const withoutTrailingSlash =
    normalized.length > 1 ? normalized.replace(/\/+$/g, '') : normalized

  return withoutTrailingSlash || '/'
}

const joinRoutePaths = (...segments: Array<string | undefined>): string => {
  const joined = segments
    .map((segment) => segment?.trim())
    .filter((segment): segment is string => Boolean(segment))
    .join('/')

  return normalizeRoutePath(joined)
}

export const deriveRouteFromSourcePath = ({
  slug,
  routeBase,
  sourcePath,
}: {
  routeBase: string
  slug?: string
  sourcePath: string
}): string => {
  const normalizedPath = normalizeDocsPath(sourcePath)
  const normalizedRouteBase = normalizeRouteBase(routeBase)

  if (!normalizedPath.ok) {
    return normalizedRouteBase
  }

  let routeSegments = [...normalizedPath.routeSegments]
  const routeBaseSegments = normalizedRouteBase.split('/').filter(Boolean)

  if (
    routeBaseSegments.length > 0 &&
    routeBaseSegments.every((segment, index) => routeSegments[index] === segment)
  ) {
    routeSegments = routeSegments.slice(routeBaseSegments.length)
  }

  const normalizedSlug = slug?.trim()
  const isIndexSourcePath =
    normalizedPath.path.split('/').at(-1)?.toLowerCase() === 'index.md'
  const shouldApplySlug = Boolean(
    normalizedSlug && !(isIndexSourcePath && normalizedSlug.toLowerCase() === 'index'),
  )

  if (shouldApplySlug && normalizedSlug && routeSegments.length > 0) {
    routeSegments[routeSegments.length - 1] = normalizedSlug
  } else if (shouldApplySlug && normalizedSlug) {
    routeSegments = [normalizedSlug]
  }

  const routeSuffix = routeSegments.join('/')

  if (!routeSuffix) {
    return normalizedRouteBase
  }

  return `${normalizedRouteBase}/${routeSuffix}`.replace(/\/+/g, '/')
}

export const deriveAssetRouteFromSourcePath = ({
  kind,
  route,
  routeBase,
  sourceId,
  sourcePath,
}: {
  kind: string
  route?: string
  routeBase: string
  sourceId?: string
  sourcePath: string
}): string | undefined => {
  if (route && route.trim() !== '') {
    return normalizeRoutePath(route)
  }

  if (kind === 'llms') {
    return '/llms.txt'
  }

  if (kind === 'llms-full') {
    return '/llms-full.txt'
  }

  if (kind !== 'skill' || !sourceId) {
    return undefined
  }

  const expectedPrefix = `skills/${sourceId}/`

  if (!sourcePath.startsWith(expectedPrefix)) {
    return undefined
  }

  const skillPath = sourcePath.slice(expectedPrefix.length)

  if (!skillPath) {
    return undefined
  }

  return joinRoutePaths(routeBase, 'skills', skillPath)
}

export const deriveSkillArchiveRouteFromSourcePath = ({
  routeBase,
  sourceId,
  sourcePath,
}: {
  routeBase: string
  sourceId: string
  sourcePath: string
}): string | undefined => {
  const normalizedPath = normalizeAssetPath(sourcePath)

  if (!normalizedPath.ok) {
    return undefined
  }

  const expectedPrefix = `skills/${sourceId}/`

  if (!normalizedPath.path.startsWith(expectedPrefix)) {
    return undefined
  }

  const skillPath = normalizedPath.path.slice(expectedPrefix.length)
  const [agent] = skillPath.split('/').filter(Boolean)

  if (!agent) {
    return undefined
  }

  return joinRoutePaths(routeBase, 'skills', `${agent}.zip`)
}

const getSkillSourcePathParts = ({
  sourceId,
  sourcePath,
}: {
  sourceId: string
  sourcePath: string
}):
  | {
      agent: string
      filePath: string
    }
  | undefined => {
  const normalizedPath = normalizeAssetPath(sourcePath)

  if (!normalizedPath.ok) {
    return undefined
  }

  const [root, pathSourceId, agent, ...fileSegments] = normalizedPath.segments

  if (root !== 'skills' || pathSourceId !== sourceId || !agent || fileSegments.length === 0) {
    return undefined
  }

  return {
    agent,
    filePath: fileSegments.join('/'),
  }
}

export const deriveSkillIndexRouteFromSourcePath = ({
  routeBase,
  sourceId,
  sourcePath,
}: {
  routeBase: string
  sourceId: string
  sourcePath: string
}): string | undefined => {
  const parts = getSkillSourcePathParts({
    sourceId,
    sourcePath,
  })

  return parts ? joinRoutePaths(routeBase, 'skills', parts.agent) : undefined
}

export const deriveSkillDirectoryIndexRouteFromSourcePath = ({
  routeBase,
  sourceId,
  sourcePath,
}: {
  routeBase: string
  sourceId: string
  sourcePath: string
}): string | undefined => {
  const parts = getSkillSourcePathParts({
    sourceId,
    sourcePath,
  })

  if (!parts) {
    return undefined
  }

  const directorySegments = parts.filePath.split('/').slice(0, -1)

  return joinRoutePaths(routeBase, 'skills', parts.agent, ...directorySegments)
}
