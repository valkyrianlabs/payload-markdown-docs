/**
 * Markdown link resolution for generated docs, shared by the HTML page renderer and the
 * llms-full.txt generator so both resolve relative and docs-root links the same way
 * (X-6). Pure string functions: no React, no Payload.
 */
import { isRouteDescendant, joinRouteSegments, normalizeRoutePath } from './paths.js'

export type DocsLinkSourceDoc = {
  sourcePath: string
}

export type DocsLinkDocsSet = {
  productRoute: string
  routeBase: string
  routeMode: 'docs-root' | 'product-nested'
}

const isExternalHref = (href: string): boolean =>
  /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')

const splitHrefPath = (href: string): { path: string; suffix: string } => {
  const queryIndex = href.indexOf('?')
  const hashIndex = href.indexOf('#')
  const suffixIndex = [queryIndex, hashIndex]
    .filter((index) => index >= 0)
    .sort((first, second) => first - second)[0]

  if (suffixIndex === undefined) {
    return {
      path: href,
      suffix: '',
    }
  }

  return {
    path: href.slice(0, suffixIndex),
    suffix: href.slice(suffixIndex),
  }
}

const getDocDirectorySegments = (doc?: DocsLinkSourceDoc): string[] => {
  if (!doc) {
    return []
  }

  const segments = doc.sourcePath.replace(/\\/g, '/').split('/').filter(Boolean)

  segments.pop()

  return segments
}

const normalizeDocsLinkSegments = (segments: string[]): string[] => {
  const normalizedSegments: string[] = []

  for (const segment of segments) {
    const trimmedSegment = segment.trim()

    if (!trimmedSegment || trimmedSegment === '.') {
      continue
    }

    if (trimmedSegment === '..') {
      normalizedSegments.pop()
      continue
    }

    normalizedSegments.push(trimmedSegment.replace(/\.md$/i, ''))
  }

  if (normalizedSegments.at(-1)?.toLowerCase() === 'index') {
    normalizedSegments.pop()
  }

  return normalizedSegments
}

const getRouteSuffix = ({
  baseRoute,
  route,
}: {
  baseRoute: string
  route: string
}): string | undefined => {
  if (route === baseRoute) {
    return ''
  }

  if (!isRouteDescendant(baseRoute, route)) {
    return undefined
  }

  return route.slice(baseRoute.length + 1)
}

const rewriteDocsHref = ({
  doc,
  docsSet,
  href,
}: {
  doc?: DocsLinkSourceDoc
  docsSet: DocsLinkDocsSet
  href: string
}): string => {
  const trimmedHref = href.trim()

  if (!trimmedHref || trimmedHref.startsWith('#') || isExternalHref(trimmedHref)) {
    return href
  }

  const { path, suffix } = splitHrefPath(trimmedHref)

  if (!path || path === '.') {
    return href
  }

  if (path.startsWith('/')) {
    const route = normalizeRoutePath(path)
    const routeBaseSuffix = getRouteSuffix({
      baseRoute: docsSet.routeBase,
      route,
    })

    if (routeBaseSuffix !== undefined) {
      const segments = normalizeDocsLinkSegments(routeBaseSuffix ? routeBaseSuffix.split('/') : [])

      return `${joinRouteSegments(docsSet.routeBase, ...segments)}${suffix}`
    }

    if (docsSet.routeMode === 'product-nested') {
      const productRouteSuffix = getRouteSuffix({
        baseRoute: docsSet.productRoute,
        route,
      })

      if (productRouteSuffix !== undefined) {
        if (!productRouteSuffix) {
          return href
        }

        const segments = normalizeDocsLinkSegments(productRouteSuffix.split('/'))

        return `${joinRouteSegments(
          segments.length === 0 ? docsSet.routeBase : docsSet.productRoute,
          ...segments,
        )}${suffix}`
      }
    }
  }

  const pathSegments = path.startsWith('/')
    ? path.replace(/^\/+/g, '').split('/')
    : [...getDocDirectorySegments(doc), ...path.split('/')]
  const normalizedSegments = normalizeDocsLinkSegments(pathSegments)
  const baseRoute =
    docsSet.routeMode === 'product-nested' && normalizedSegments.length > 0
      ? docsSet.productRoute
      : docsSet.routeBase

  return `${joinRouteSegments(baseRoute, ...normalizedSegments)}${suffix}`
}

const rewriteMarkdownLinkDestination = ({
  destination,
  doc,
  docsSet,
}: {
  destination: string
  doc?: DocsLinkSourceDoc
  docsSet: DocsLinkDocsSet
}): string => {
  const isAngleWrapped = destination.startsWith('<') && destination.endsWith('>')
  const href = isAngleWrapped ? destination.slice(1, -1) : destination
  const rewrittenHref = rewriteDocsHref({
    doc,
    docsSet,
    href,
  })

  return isAngleWrapped ? `<${rewrittenHref}>` : rewrittenHref
}

const rewriteMarkdownLineLinks = ({
  doc,
  docsSet,
  line,
}: {
  doc?: DocsLinkSourceDoc
  docsSet: DocsLinkDocsSet
  line: string
}): string =>
  line
    .replace(
      /(!?)\[([^\]\n]+)\]\(([^()\s]+)([ \t]+(?:"[^"\n]*"|'[^'\n]*'|\([^)\n]*\)))?\)/g,
      (match, imagePrefix, label, href, rest) => {
        if (imagePrefix) {
          return match
        }

        return `[${label}](${rewriteMarkdownLinkDestination({
          destination: href,
          doc,
          docsSet,
        })}${rest ?? ''})`
      },
    )
    .replace(
      /^([ \t]{0,3}\[[^\]\n]+\]:[ \t]*)(\S+)([ \t].*)?$/,
      (match, prefix, href, rest) => {
        if (!prefix) {
          return match
        }

        return `${prefix}${rewriteMarkdownLinkDestination({
          destination: href,
          doc,
          docsSet,
        })}${rest ?? ''}`
      },
    )
    .replace(/\bhref=(["'])(.*?)\1/g, (_match, quote, href) => {
      const rewrittenHref = rewriteDocsHref({
        doc,
        docsSet,
        href,
      })

      return `href=${quote}${rewrittenHref}${quote}`
    })

export const rewritePayloadMarkdownDocsLinks = ({
  doc,
  docsSet,
  markdown,
}: {
  doc?: DocsLinkSourceDoc
  docsSet: DocsLinkDocsSet
  markdown: string
}): string => {
  let inFence = false
  let fenceMarker: '```' | '~~~' | undefined

  return markdown
    .split('\n')
    .map((line) => {
      const fenceMatch = line.match(/^[ \t]{0,3}(```|~~~)/)

      if (fenceMatch) {
        const marker = fenceMatch[1] as '```' | '~~~'

        if (!inFence) {
          inFence = true
          fenceMarker = marker
        } else if (marker === fenceMarker) {
          inFence = false
          fenceMarker = undefined
        }

        return line
      }

      if (inFence) {
        return line
      }

      return rewriteMarkdownLineLinks({
        doc,
        docsSet,
        line,
      })
    })
    .join('\n')
}

