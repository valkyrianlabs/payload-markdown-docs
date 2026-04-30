import { createPublicKey, verify } from 'node:crypto'

import { sha256Hex } from '../sync/index.js'

export type VerifyBodyHashResult =
  | {
      computedHash: string
      ok: false
    }
  | {
      computedHash: string
      ok: true
    }

export type ValidateTimestampResult =
  | {
      date: Date
      ok: true
    }
  | {
      message: string
      ok: false
    }

export const verifyBodySha256 = ({
  body,
  expectedHash,
}: {
  body: string
  expectedHash: string
}): VerifyBodyHashResult => {
  const computedHash = sha256Hex(body)

  if (!/^[a-f0-9]{64}$/i.test(expectedHash)) {
    return {
      computedHash,
      ok: false,
    }
  }

  return {
    computedHash,
    ok: computedHash === expectedHash.toLowerCase(),
  }
}

export const validateTimestampSkew = ({
  maxSkewSeconds,
  now = new Date(),
  timestamp,
}: {
  maxSkewSeconds: number
  now?: Date
  timestamp: string
}): ValidateTimestampResult => {
  const date = new Date(timestamp)

  if (Number.isNaN(date.getTime())) {
    return {
      message: 'Sync request timestamp is invalid.',
      ok: false,
    }
  }

  const skewMs = Math.abs(now.getTime() - date.getTime())

  if (skewMs > maxSkewSeconds * 1000) {
    return {
      message: 'Sync request timestamp is outside the allowed skew.',
      ok: false,
    }
  }

  return {
    date,
    ok: true,
  }
}

const getPublicKeyInput = (publicKey: string) => {
  if (publicKey.includes('BEGIN PUBLIC KEY')) {
    return publicKey
  }

  return createPublicKey({
    type: 'spki',
    format: 'der',
    key: Buffer.from(publicKey, 'base64'),
  })
}

export const verifyEd25519Signature = ({
  canonicalString,
  publicKey,
  signature,
}: {
  canonicalString: string
  publicKey: string
  signature: string
}): boolean => {
  try {
    return verify(
      null,
      Buffer.from(canonicalString, 'utf8'),
      getPublicKeyInput(publicKey),
      Buffer.from(signature, 'base64'),
    )
  } catch {
    return false
  }
}

