import type {
  PayloadMarkdownDocsMetadata,
  PayloadMarkdownDocsMetadataImage,
  PayloadMarkdownDocsOpenGraphImage,
  ResolvedPayloadMarkdownDocsRoute,
  ResolvePayloadMarkdownDocsRouteOptions,
} from './types.js'

import { resolvePayloadMarkdownDocsRoute } from './route.js'

const compactObject = <T extends Record<string, unknown>>(input: T): Partial<T> =>
  Object.fromEntries(
    Object.entries(input).filter(([, value]) => {
      if (value === undefined || value === '') {
        return false
      }

      if (Array.isArray(value)) {
        return value.length > 0
      }

      if (typeof value === 'object' && value !== null) {
        return Object.keys(value).length > 0
      }

      return true
    }),
  ) as Partial<T>

const toMetadataImage = (
  image?: PayloadMarkdownDocsOpenGraphImage,
): PayloadMarkdownDocsMetadataImage | undefined => {
  if (!image) {
    return undefined
  }

  return compactObject({
    alt: image.alt,
    height: image.height,
    url: image.url,
    width: image.width,
  }) as PayloadMarkdownDocsMetadataImage
}

const toMetadata = ({
  description,
  image,
  title,
}: {
  description?: string
  image?: PayloadMarkdownDocsOpenGraphImage
  title?: string
}): PayloadMarkdownDocsMetadata => {
  const metadataImage = toMetadataImage(image)
  const images = metadataImage ? [metadataImage] : undefined
  const openGraph = compactObject({
    description,
    images,
    title,
  })
  const twitter = compactObject({
    card: metadataImage ? 'summary_large_image' as const : undefined,
    description,
    images,
    title,
  })

  return compactObject({
    description,
    openGraph,
    title,
    twitter,
  }) as PayloadMarkdownDocsMetadata
}

export const getPayloadMarkdownDocsMetadata = (
  resolved: ResolvedPayloadMarkdownDocsRoute,
): PayloadMarkdownDocsMetadata => {
  if (resolved.type === 'docsGroupIndex') {
    return toMetadata({
      description: resolved.group.description,
      title: resolved.group.navTitle ?? resolved.group.title,
    })
  }

  if (resolved.type === 'docsSetIndex' && !resolved.doc) {
    return toMetadata({
      description: resolved.docsSet.openGraph?.description ?? resolved.docsSet.description,
      image: resolved.docsSet.openGraph?.image,
      title:
        resolved.docsSet.openGraph?.title ??
        resolved.docsSet.navTitle ??
        resolved.docsSet.title,
    })
  }

  const doc = resolved.doc

  if (!doc) {
    return toMetadata({
      description: resolved.docsSet.openGraph?.description ?? resolved.docsSet.description,
      image: resolved.docsSet.openGraph?.image,
      title:
        resolved.docsSet.openGraph?.title ??
        resolved.docsSet.navTitle ??
        resolved.docsSet.title,
    })
  }

  return toMetadata({
    description:
      doc.description ?? resolved.docsSet.openGraph?.description ?? resolved.docsSet.description,
    image: doc.heroImage ?? resolved.docsSet.openGraph?.image,
    title:
      doc.title ??
      resolved.docsSet.openGraph?.title ??
      resolved.docsSet.navTitle ??
      resolved.docsSet.title,
  })
}

export const generatePayloadMarkdownDocsMetadata = async (
  options: ResolvePayloadMarkdownDocsRouteOptions,
): Promise<null | PayloadMarkdownDocsMetadata> => {
  const resolved = await resolvePayloadMarkdownDocsRoute(options)

  return resolved ? getPayloadMarkdownDocsMetadata(resolved) : null
}
