import { describe, expect, it } from 'vitest'

import { consumeNonce, type NoncePayloadOperations } from './nonce.js'

type Row = { expiresAt: string; id: string; keyId: string; nonce: string }

/** A nonces collection without the unique (keyId, nonce) index: every insert succeeds. */
const createUnindexedPayload = (rows: Row[] = []): NoncePayloadOperations => {
  let nextId = rows.length

  return {
    create: ({ data }) => {
      const row = { ...(data as Omit<Row, 'id'>), id: `nonce-${(nextId += 1)}` }
      rows.push(row)

      return Promise.resolve(row)
    },
    find: ({ where }) => {
      const [keyId, nonce] = (where as { and: Array<Record<string, { equals: string }>> }).and.map(
        (clause) => Object.values(clause)[0]?.equals,
      )

      return Promise.resolve({ docs: rows.filter((row) => row.keyId === keyId && row.nonce === nonce) })
    },
  }
}

const now = new Date('2026-10-02T12:00:00.000Z')
const expiresAt = new Date(now.getTime() + 5 * 60_000)

const consume = (payload: NoncePayloadOperations, nonce = 'n-1') =>
  consumeNonce({
    bodyHash: 'hash',
    collectionSlug: 'docs-sync-nonces',
    expiresAt,
    keyId: 'key-1',
    nonce,
    now,
    payload,
  })

describe('consumeNonce without a unique index', () => {
  it('rejects a replay that the database accepted', async () => {
    const payload = createUnindexedPayload()

    await expect(consume(payload)).resolves.toBe(true)
    await expect(consume(payload)).resolves.toBe(false)
    await expect(consume(payload, 'n-2')).resolves.toBe(true)
  })

  it('fails closed for concurrent requests with one nonce', async () => {
    const payload = createUnindexedPayload()

    await expect(Promise.all([consume(payload), consume(payload)])).resolves.toEqual([false, false])
  })

  it('ignores expired rows for the same nonce', async () => {
    const payload = createUnindexedPayload([
      { id: 'old', expiresAt: new Date(now.getTime() - 1000).toISOString(), keyId: 'key-1', nonce: 'n-1' },
    ])

    await expect(consume(payload)).resolves.toBe(true)
  })
})
