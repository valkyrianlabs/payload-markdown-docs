import {
  randomUUID,
  sign,
} from 'node:crypto'

import { sha256Hex } from '../sync/index.js'
import { buildCanonicalSigningString } from './canonical.js'
import { getEd25519PrivateKeyInput } from './ed25519Keys.js'

export type SignDocsSyncRequestOptions = {
  body: string
  endpoint: string
  keyId: string
  nonce?: string
  now?: Date
  privateKey: string
}

export type SignedDocsSyncRequest = {
  body: string
  headers: Record<string, string>
}

const getEndpointPathname = (endpoint: string): string => new URL(endpoint).pathname

export const signDocsSyncRequest = ({
  body,
  endpoint,
  keyId,
  nonce = randomUUID(),
  now = new Date(),
  privateKey,
}: SignDocsSyncRequestOptions): SignedDocsSyncRequest => {
  const bodySha256 = sha256Hex(body)
  const timestamp = now.toISOString()
  const canonicalString = buildCanonicalSigningString({
    bodySha256,
    method: 'POST',
    nonce,
    path: getEndpointPathname(endpoint),
    timestamp,
  })
  const signature = sign(
    null,
    Buffer.from(canonicalString, 'utf8'),
    getEd25519PrivateKeyInput(privateKey),
  ).toString('base64')

  return {
    body,
    headers: {
      'Content-Type': 'application/json',
      'X-VL-MD-DOCS-Body-SHA256': bodySha256,
      'X-VL-MD-DOCS-Key-Id': keyId,
      'X-VL-MD-DOCS-Nonce': nonce,
      'X-VL-MD-DOCS-Signature': signature,
      'X-VL-MD-DOCS-Timestamp': timestamp,
    },
  }
}
