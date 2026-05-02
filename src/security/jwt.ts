export type DecodedJwt = {
  encodedHeader: string
  encodedPayload: string
  header: Record<string, unknown>
  payload: Record<string, unknown>
  signature: Buffer
  signingInput: string
}

const base64UrlToBuffer = (input: string): Buffer => {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    '=',
  )

  return Buffer.from(padded, 'base64')
}

const parseJsonObject = (buffer: Buffer): Record<string, unknown> | undefined => {
  try {
    const parsed = JSON.parse(buffer.toString('utf8')) as unknown

    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    return undefined
  }

  return undefined
}

export const decodeJwt = (token: string): DecodedJwt | undefined => {
  const parts = token.split('.')

  if (parts.length !== 3) {
    return undefined
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts

  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    return undefined
  }

  const header = parseJsonObject(base64UrlToBuffer(encodedHeader))
  const payload = parseJsonObject(base64UrlToBuffer(encodedPayload))

  if (!header || !payload) {
    return undefined
  }

  return {
    encodedHeader,
    encodedPayload,
    header,
    payload,
    signature: base64UrlToBuffer(encodedSignature),
    signingInput: `${encodedHeader}.${encodedPayload}`,
  }
}

export const toBase64Url = (input: Buffer | string): string =>
  Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
