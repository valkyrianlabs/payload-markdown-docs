import type { PayloadRequest } from 'payload'

import { normalizeRoutePath } from '../routing/index.js'

type OriginCandidate = {
  assumeHttps?: boolean
  value?: string
}

const getString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const getFirstHeaderValue = (value: null | string): string | undefined =>
  value
    ?.split(',')
    .map((item) => item.trim())
    .filter(Boolean)[0]

const normalizeOrigin = ({ assumeHttps = false, value }: OriginCandidate): string | undefined => {
  const trimmed = value?.trim().replace(/\/+$/g, '')

  if (!trimmed) {
    return undefined
  }

  const withProtocol =
    assumeHttps && !/^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? `https://${trimmed}` : trimmed

  try {
    return new URL(withProtocol).origin
  } catch {
    return withProtocol
  }
}

const isInternalOrigin = (origin: string): boolean => {
  try {
    const hostname = new URL(origin).hostname.toLowerCase()

    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname === '::1' ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal')
    )
  } catch {
    return false
  }
}

const pickBestOrigin = (candidates: OriginCandidate[]): string | undefined => {
  const origins = candidates.flatMap((candidate) => {
    const origin = normalizeOrigin(candidate)

    return origin ? [origin] : []
  })

  return origins.find((origin) => !isInternalOrigin(origin)) ?? origins[0]
}

export const getPublicRequestOrigin = (req: PayloadRequest): string | undefined => {
  const forwardedProto = getFirstHeaderValue(req.headers.get('x-forwarded-proto'))
  const forwardedHost = getFirstHeaderValue(req.headers.get('x-forwarded-host'))
  const host = getFirstHeaderValue(req.headers.get('host'))
  const requestUrl = getString(req.url)
  const requestProtocol = (() => {
    if (!requestUrl) {
      return undefined
    }

    try {
      return new URL(requestUrl).protocol.replace(/:$/g, '')
    } catch {
      return undefined
    }
  })()
  const serverURL = isRecord(req.payload.config)
    ? getString((req.payload.config as Record<string, unknown>).serverURL)
    : undefined

  return pickBestOrigin([
    {
      value: process.env.NEXT_PUBLIC_SERVER_URL,
    },
    {
      value: process.env.NEXT_PUBLIC_SITE_URL,
    },
    {
      value: process.env.SITE_URL,
    },
    {
      assumeHttps: true,
      value: process.env.VERCEL_PROJECT_PRODUCTION_URL,
    },
    {
      assumeHttps: true,
      value: process.env.VERCEL_URL,
    },
    {
      value: forwardedHost
        ? `${forwardedProto ?? requestProtocol ?? 'https'}://${forwardedHost}`
        : undefined,
    },
    {
      value: host ? `${requestProtocol ?? 'https'}://${host}` : undefined,
    },
    {
      value: serverURL,
    },
    {
      value: requestUrl,
    },
  ])
}

export const createPublicUrl = (origin: string | undefined, route: string): string => {
  const normalizedRoute = normalizeRoutePath(route)

  return origin ? `${origin}${normalizedRoute}` : normalizedRoute
}
