import type {
  DocsBackgroundFit,
  DocsBackgroundMediaInput,
  DocsBackgroundOverlayVariant,
  DocsBackgroundPosition,
  NormalizedDocsBackgroundMedia,
  NormalizedDocsMedia,
} from '../marketing/types.js'

import { getBoolean, getNumber, getRecordString, getString, isRecord } from './normalizeShared.js'

const fits: DocsBackgroundFit[] = ['cover', 'contain', 'fill']
const positions: DocsBackgroundPosition[] = ['center', 'top', 'bottom', 'left', 'right']
const overlayVariants: DocsBackgroundOverlayVariant[] = ['dark', 'light', 'brand', 'gradient']

const getFit = (value: unknown): DocsBackgroundFit =>
  typeof value === 'string' && fits.includes(value as DocsBackgroundFit)
    ? (value as DocsBackgroundFit)
    : 'cover'

const getPosition = (value: unknown): DocsBackgroundPosition =>
  typeof value === 'string' && positions.includes(value as DocsBackgroundPosition)
    ? (value as DocsBackgroundPosition)
    : 'center'

const getOverlayVariant = (value: unknown): DocsBackgroundOverlayVariant =>
  typeof value === 'string' && overlayVariants.includes(value as DocsBackgroundOverlayVariant)
    ? (value as DocsBackgroundOverlayVariant)
    : 'dark'

const clampOpacity = (value: unknown): number => {
  const opacity = getNumber(value)

  if (opacity === undefined) {
    return 45
  }

  return Math.max(0, Math.min(95, opacity))
}

const unwrapUpload = (input: unknown): unknown => {
  if (isRecord(input) && isRecord(input.value)) {
    return input.value
  }

  return input
}

export const normalizeMedia = (input: unknown): NormalizedDocsMedia | undefined => {
  const media = unwrapUpload(input)

  if (!isRecord(media)) {
    return undefined
  }

  const url = getRecordString(media, 'url')

  if (!url) {
    return undefined
  }

  return {
    id:
      typeof media.id === 'string' || typeof media.id === 'number' ? String(media.id) : undefined,
    alt: getRecordString(media, 'alt'),
    height: getNumber(media.height),
    relationTo: isRecord(input) ? getRecordString(input, 'relationTo') : undefined,
    url,
    width: getNumber(media.width),
  }
}

export const normalizeBackgroundMedia = (
  input: DocsBackgroundMediaInput | null | undefined,
): NormalizedDocsBackgroundMedia => {
  const record: Record<string, unknown> = isRecord(input) ? input : {}
  const media = normalizeMedia(record.media ?? record.image ?? record.backgroundImage ?? input)

  return {
    caption: getString(record.caption),
    fit: getFit(record.fit),
    gradient:
      record.gradient === 'brand' || record.gradient === 'subtle' || record.gradient === 'none'
        ? record.gradient
        : undefined,
    media,
    overlay: getBoolean(record.overlay) ?? Boolean(media),
    overlayOpacity: clampOpacity(record.overlayOpacity),
    overlayVariant: getOverlayVariant(record.overlayVariant),
    position: getPosition(record.position),
  }
}
