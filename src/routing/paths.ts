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

export type DocsSetRouteMode = 'docs-root' | 'product-nested'

export const DEFAULT_DOCS_SET_ROUTE_MODE: DocsSetRouteMode = 'docs-root'
export const DEFAULT_PRODUCT_NESTED_DOCS_SEGMENT = 'docs'

export const deriveDocsSetProductRoutePath = ({
  docsSetSlug,
  groupRoutePath,
}: {
  docsSetSlug: string
  groupRoutePath?: string
}): string => joinRouteSegments(groupRoutePath ?? '/', docsSetSlug)

export const deriveDocsSetRouteBase = ({
  docsSetSlug,
  groupRoutePath,
  routeMode = DEFAULT_DOCS_SET_ROUTE_MODE,
}: {
  docsSetSlug: string
  groupRoutePath?: string
  routeMode?: DocsSetRouteMode
}): string => {
  const productRoute = deriveDocsSetProductRoutePath({
    docsSetSlug,
    groupRoutePath,
  })

  return routeMode === 'product-nested'
    ? joinRouteSegments(productRoute, DEFAULT_PRODUCT_NESTED_DOCS_SEGMENT)
    : productRoute
}

export const isRouteDescendant = (parent: string, child: string): boolean => {
  const normalizedParent = normalizeRoutePath(parent)
  const normalizedChild = normalizeRoutePath(child)

  if (normalizedParent === '/') {
    return normalizedChild !== '/'
  }

  return normalizedChild.startsWith(`${normalizedParent}/`)
}
