export type CanonicalSigningStringInput = {
  bodySha256: string
  method: string
  nonce: string
  path: string
  timestamp: string
}

const normalizeCanonicalPath = (path: string): string => {
  const normalized = `/${path.trim()}`.replace(/\/+/g, '/')

  return normalized.length > 1 ? normalized.replace(/\/+$/g, '') : normalized
}

export const buildCanonicalSigningString = ({
  bodySha256,
  method,
  nonce,
  path,
  timestamp,
}: CanonicalSigningStringInput): string =>
  [
    'v1',
    method.toUpperCase(),
    normalizeCanonicalPath(path),
    timestamp,
    nonce,
    bodySha256.toLowerCase(),
  ].join('\n')

export const getCanonicalPathFromRequestUrl = ({
  endpointPath,
  url,
}: {
  endpointPath: string
  url?: string
}): string => {
  if (url) {
    try {
      return new URL(url).pathname
    } catch {
      // Fall through to the configured Payload API route.
    }
  }

  return `/api/${endpointPath}`.replace(/\/+/g, '/')
}

