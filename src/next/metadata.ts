import type {
  PayloadMarkdownDocsMetadata,
  ResolvedPayloadMarkdownDocsRoute,
  ResolvePayloadMarkdownDocsRouteOptions,
} from './types.js'

import { resolvePayloadMarkdownDocsRoute } from './route.js'

const compactMetadata = (
  metadata: PayloadMarkdownDocsMetadata,
): PayloadMarkdownDocsMetadata =>
  Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => value !== undefined && value !== ''),
  ) as PayloadMarkdownDocsMetadata

export const getPayloadMarkdownDocsMetadata = (
  resolved: ResolvedPayloadMarkdownDocsRoute,
): PayloadMarkdownDocsMetadata => {
  if (resolved.type === 'docsGroupIndex') {
    return compactMetadata({
      description: resolved.group.description,
      title: resolved.group.navTitle ?? resolved.group.title,
    })
  }

  if (resolved.type === 'docsSetIndex' && !resolved.doc) {
    return compactMetadata({
      description:
        resolved.docsSet.defaults?.seoDescription ?? resolved.docsSet.description,
      title:
        resolved.docsSet.defaults?.seoTitle ??
        resolved.docsSet.defaults?.heroTitle ??
        resolved.docsSet.navTitle ??
        resolved.docsSet.title,
    })
  }

  const doc = resolved.doc

  if (!doc) {
    return compactMetadata({
      description:
        resolved.docsSet.defaults?.seoDescription ?? resolved.docsSet.description,
      title:
        resolved.docsSet.defaults?.seoTitle ??
        resolved.docsSet.defaults?.heroTitle ??
        resolved.docsSet.navTitle ??
        resolved.docsSet.title,
    })
  }

  return compactMetadata({
    description:
      doc.overrides?.seoDescription ??
      doc.overrides?.heroDescription ??
      doc.description ??
      resolved.docsSet.defaults?.seoDescription ??
      resolved.docsSet.description,
    title:
      doc.overrides?.seoTitle ??
      doc.overrides?.heroTitle ??
      doc.title ??
      resolved.docsSet.defaults?.seoTitle ??
      resolved.docsSet.title,
  })
}

export const generatePayloadMarkdownDocsMetadata = async (
  options: ResolvePayloadMarkdownDocsRouteOptions,
): Promise<null | PayloadMarkdownDocsMetadata> => {
  const resolved = await resolvePayloadMarkdownDocsRoute(options)

  return resolved ? getPayloadMarkdownDocsMetadata(resolved) : null
}
