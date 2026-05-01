export const normalizeRoutePath = (input: string): string => {
  const trimmed = input.trim()

  if (!trimmed || trimmed === '/') {
    return '/'
  }

  const normalized = `/${trimmed}`
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/\/+$/g, '')

  return normalized || '/'
}

export const joinRouteSegments = (...segments: (string | undefined)[]): string => {
  const normalizedSegments = segments
    .flatMap((segment) => (segment ?? '').split(/[\\/]+/))
    .map((segment) => segment.trim())
    .filter(Boolean)

  return normalizeRoutePath(normalizedSegments.join('/'))
}

export const deriveDocsSetRouteBase = ({
  docsSetSlug,
  groupRoutePath,
}: {
  docsSetSlug: string
  groupRoutePath?: string
}): string => joinRouteSegments(groupRoutePath ?? '/', docsSetSlug)

export const isRouteDescendant = (parent: string, child: string): boolean => {
  const normalizedParent = normalizeRoutePath(parent)
  const normalizedChild = normalizeRoutePath(child)

  if (normalizedParent === '/') {
    return normalizedChild !== '/'
  }

  return normalizedChild.startsWith(`${normalizedParent}/`)
}
