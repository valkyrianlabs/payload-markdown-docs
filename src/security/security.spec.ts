import { generateKeyPairSync, sign } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import { sha256Hex } from '../sync/index.js'
import {
  buildCanonicalSigningString,
  buildOpenSshEd25519PublicKey,
  extractSyncRequestHeaders,
  signDocsSyncRequest,
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

const decodeBase64Url = (value: string): Buffer =>
  Buffer.from(
    value
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(value.length / 4) * 4, '='),
    'base64',
  )

const packOpenSshString = (value: Buffer | string): Buffer => {
  const buffer = typeof value === 'string' ? Buffer.from(value, 'utf8') : value
  const length = Buffer.alloc(4)
  length.writeUInt32BE(buffer.length, 0)

  return Buffer.concat([length, buffer])
}

const uint32 = (value: number): Buffer => {
  const buffer = Buffer.alloc(4)
  buffer.writeUInt32BE(value, 0)

  return buffer
}

const wrapOpenSshPem = (body: Buffer): string => {
  const base64 = body.toString('base64')
  const lines = base64.match(/.{1,70}/g) ?? []

  return [
    '-----BEGIN OPENSSH PRIVATE KEY-----',
    ...lines,
    '-----END OPENSSH PRIVATE KEY-----',
  ].join('\n')
}

const openSshKeyPair = () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const privateJwk = privateKey.export({ format: 'jwk' }) as {
    d: string
    x: string
  }
  const publicJwk = publicKey.export({ format: 'jwk' }) as {
    x: string
  }
  const seed = decodeBase64Url(privateJwk.d)
  const publicKeyBytes = decodeBase64Url(publicJwk.x)
  const publicBlob = Buffer.concat([
    packOpenSshString('ssh-ed25519'),
    packOpenSshString(publicKeyBytes),
  ])
  const privateKeyBytes = Buffer.concat([seed, publicKeyBytes])
  const privateBlobWithoutPadding = Buffer.concat([
    uint32(0x12345678),
    uint32(0x12345678),
    packOpenSshString('ssh-ed25519'),
    packOpenSshString(publicKeyBytes),
    packOpenSshString(privateKeyBytes),
    packOpenSshString('payload-markdown-docs-test'),
  ])
  const paddingLength = (8 - (privateBlobWithoutPadding.length % 8)) % 8
  const padding = Buffer.from(
    Array.from({ length: paddingLength }, (_value, index) => index + 1),
  )
  const privateBlob = Buffer.concat([privateBlobWithoutPadding, padding])
  const opensshPrivateKey = wrapOpenSshPem(
    Buffer.concat([
      Buffer.from('openssh-key-v1\0', 'utf8'),
      packOpenSshString('none'),
      packOpenSshString('none'),
      packOpenSshString(Buffer.alloc(0)),
      uint32(1),
      packOpenSshString(publicBlob),
      packOpenSshString(privateBlob),
    ]),
  )

  return {
    privateKey: opensshPrivateKey,
    publicKey: buildOpenSshEd25519PublicKey({
      comment: 'payload-markdown-docs-test',
      publicKey: publicKeyBytes,
    }),
  }
}

describe('sync security helpers', () => {
  it('generates a stable canonical signing string', () => {
    expect(
      buildCanonicalSigningString({
        bodySha256: 'ABC123',
        method: 'post',
        nonce: 'nonce-1',
        path: '/api/documentation/sync',
        timestamp: '2026-01-01T00:00:00.000Z',
      }),
    ).toBe(
      [
        'v1',
        'POST',
        '/api/documentation/sync',
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
    const canonicalString = 'v1\nPOST\n/api/documentation/sync\nt\nn\nh'
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
    const canonicalString = 'v1\nPOST\n/api/documentation/sync\nt\nn\nh'
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

  it('signs sync requests with required headers and a matching body hash', () => {
    const { privateKey } = keyPair()
    const body = '{"version":1}'
    const signed = signDocsSyncRequest({
      body,
      endpoint: 'https://example.com/api/documentation/sync',
      keyId: 'github-actions-main',
      nonce: 'nonce-1',
      now: new Date('2026-01-01T00:00:00.000Z'),
      privateKey: privateKey.toString(),
    })

    expect(signed.body).toBe(body)
    expect(signed.headers).toMatchObject({
      'Content-Type': 'application/json',
      'X-VL-MD-DOCS-Body-SHA256': sha256Hex(body),
      'X-VL-MD-DOCS-Key-Id': 'github-actions-main',
      'X-VL-MD-DOCS-Nonce': 'nonce-1',
      'X-VL-MD-DOCS-Timestamp': '2026-01-01T00:00:00.000Z',
    })
    expect(typeof signed.headers['X-VL-MD-DOCS-Signature']).toBe('string')
  })

  it('signs and verifies sync requests with OpenSSH Ed25519 keys', () => {
    const { privateKey, publicKey } = openSshKeyPair()
    const body = '{"version":1}'
    const signed = signDocsSyncRequest({
      body,
      endpoint: 'https://example.com/api/documentation/sync',
      keyId: 'ssh-docs-key',
      nonce: 'nonce-1',
      now: new Date('2026-01-01T00:00:00.000Z'),
      privateKey,
    })
    const canonicalString = buildCanonicalSigningString({
      bodySha256: sha256Hex(body),
      method: 'POST',
      nonce: 'nonce-1',
      path: '/api/documentation/sync',
      timestamp: '2026-01-01T00:00:00.000Z',
    })

    expect(
      verifyEd25519Signature({
        canonicalString,
        publicKey,
        signature: signed.headers['X-VL-MD-DOCS-Signature'] ?? '',
      }),
    ).toBe(true)
  })

  it('signs using the endpoint URL pathname as the canonical path', () => {
    const { privateKey, publicKey } = keyPair()
    const body = '{"version":1}'
    const signed = signDocsSyncRequest({
      body,
      endpoint: 'https://example.com/api/documentation/sync?ignored=true',
      keyId: 'github-actions-main',
      nonce: 'nonce-1',
      now: new Date('2026-01-01T00:00:00.000Z'),
      privateKey: privateKey.toString(),
    })
    const canonicalString = buildCanonicalSigningString({
      bodySha256: sha256Hex(body),
      method: 'POST',
      nonce: 'nonce-1',
      path: '/api/documentation/sync',
      timestamp: '2026-01-01T00:00:00.000Z',
    })

    expect(
      verifyEd25519Signature({
        canonicalString,
        publicKey: publicKey.toString(),
        signature: signed.headers['X-VL-MD-DOCS-Signature'] ?? '',
      }),
    ).toBe(true)
  })

  it('detects altered bodies after signing', () => {
    const { privateKey } = keyPair()
    const signed = signDocsSyncRequest({
      body: '{"version":1}',
      endpoint: 'https://example.com/api/documentation/sync',
      keyId: 'github-actions-main',
      nonce: 'nonce-1',
      now: new Date('2026-01-01T00:00:00.000Z'),
      privateKey: privateKey.toString(),
    })

    expect(
      verifyBodySha256({
        body: '{"version":2}',
        expectedHash: signed.headers['X-VL-MD-DOCS-Body-SHA256'] ?? '',
      }).ok,
    ).toBe(false)
  })
})
