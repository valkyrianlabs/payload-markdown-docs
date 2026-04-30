import { generateKeyPairSync, sign } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import { sha256Hex } from '../sync/index.js'
import {
  buildCanonicalSigningString,
  extractSyncRequestHeaders,
  validateTimestampSkew,
  verifyBodySha256,
  verifyEd25519Signature,
} from './index.js'

const keyPair = () =>
  generateKeyPairSync('ed25519', {
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
  })

describe('sync security helpers', () => {
  it('generates a stable canonical signing string', () => {
    expect(
      buildCanonicalSigningString({
        bodySha256: 'ABC123',
        method: 'post',
        nonce: 'nonce-1',
        path: '/api/payload-markdown-docs/sync',
        timestamp: '2026-01-01T00:00:00.000Z',
      }),
    ).toBe(
      [
        'v1',
        'POST',
        '/api/payload-markdown-docs/sync',
        '2026-01-01T00:00:00.000Z',
        'nonce-1',
        'abc123',
      ].join('\n'),
    )
  })

  it('extracts required headers case-insensitively', () => {
    const headers = new Headers({
      'X-VL-MD-DOCS-Body-SHA256': 'hash',
      'X-VL-MD-DOCS-Key-Id': 'key',
      'X-VL-MD-DOCS-Nonce': 'nonce',
      'X-VL-MD-DOCS-Signature': 'signature',
      'X-VL-MD-DOCS-Timestamp': 'timestamp',
    })

    expect(extractSyncRequestHeaders(headers)).toEqual({
      headers: {
        bodySha256: 'hash',
        keyId: 'key',
        nonce: 'nonce',
        signature: 'signature',
        timestamp: 'timestamp',
      },
      ok: true,
    })
  })

  it('reports missing required headers', () => {
    expect(extractSyncRequestHeaders(new Headers())).toEqual({
      header: 'X-VL-MD-DOCS-Body-SHA256',
      ok: false,
    })
  })

  it('verifies body hashes', () => {
    const body = '{"ok":true}'
    const expectedHash = sha256Hex(body)

    expect(
      verifyBodySha256({
        body,
        expectedHash,
      }),
    ).toEqual({
      computedHash: expectedHash,
      ok: true,
    })
  })

  it('detects body hash mismatches', () => {
    expect(
      verifyBodySha256({
        body: '{"ok":true}',
        expectedHash: '0'.repeat(64),
      }).ok,
    ).toBe(false)
  })

  it('verifies Ed25519 signatures generated from PEM keys', () => {
    const { privateKey, publicKey } = keyPair()
    const canonicalString = 'v1\nPOST\n/api/payload-markdown-docs/sync\nt\nn\nh'
    const signature = sign(null, Buffer.from(canonicalString), privateKey).toString(
      'base64',
    )

    expect(
      verifyEd25519Signature({
        canonicalString,
        publicKey: publicKey.toString(),
        signature,
      }),
    ).toBe(true)
  })

  it('rejects invalid Ed25519 signatures', () => {
    const { privateKey, publicKey } = keyPair()
    const canonicalString = 'v1\nPOST\n/api/payload-markdown-docs/sync\nt\nn\nh'
    const signature = sign(null, Buffer.from('different'), privateKey).toString('base64')

    expect(
      verifyEd25519Signature({
        canonicalString,
        publicKey: publicKey.toString(),
        signature,
      }),
    ).toBe(false)
  })

  it('accepts timestamps inside the allowed skew', () => {
    expect(
      validateTimestampSkew({
        maxSkewSeconds: 300,
        now: new Date('2026-01-01T00:00:00.000Z'),
        timestamp: '2026-01-01T00:03:00.000Z',
      }).ok,
    ).toBe(true)
  })

  it('rejects stale timestamps', () => {
    expect(
      validateTimestampSkew({
        maxSkewSeconds: 300,
        now: new Date('2026-01-01T00:10:01.000Z'),
        timestamp: '2026-01-01T00:00:00.000Z',
      }).ok,
    ).toBe(false)
  })

  it('rejects future timestamps outside skew', () => {
    expect(
      validateTimestampSkew({
        maxSkewSeconds: 300,
        now: new Date('2026-01-01T00:00:00.000Z'),
        timestamp: '2026-01-01T00:10:01.000Z',
      }).ok,
    ).toBe(false)
  })
})

