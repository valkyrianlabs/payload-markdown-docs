/**
 * Minimal transaction helper for sync apply.
 *
 * Payload's local API joins a database transaction when it receives a `req` carrying
 * `transactionID`. Adapters without transaction support (or MongoDB without a replica
 * set) return no id; the work then runs without a transaction and relies on write
 * ordering alone.
 */
export type TransactionalDatabase = {
  beginTransaction?: () => Promise<null | number | string>
  commitTransaction?: (id: number | Promise<number | string> | string) => Promise<void>
  rollbackTransaction?: (id: number | Promise<number | string> | string) => Promise<void>
}

export type SyncTransactionRequest = {
  payload: unknown
  transactionID?: number | string
} & Record<string, unknown>

export type SyncTransactionResult<T> = {
  result: T
  transactional: boolean
}

export const runInSyncTransaction = async <T>({
  payload,
  work,
}: {
  payload: { db?: TransactionalDatabase }
  work: (req: SyncTransactionRequest) => Promise<T>
}): Promise<SyncTransactionResult<T>> => {
  const db = payload.db
  const req: SyncTransactionRequest = { payload }
  let transactionID: null | number | string | undefined

  if (typeof db?.beginTransaction === 'function') {
    transactionID = await db.beginTransaction()

    if (transactionID !== null && transactionID !== undefined) {
      req.transactionID = transactionID
    }
  }

  const transactional = req.transactionID !== undefined

  try {
    const result = await work(req)

    if (transactional && typeof db?.commitTransaction === 'function') {
      await db.commitTransaction(req.transactionID as number | string)
    }

    return {
      result,
      transactional,
    }
  } catch (error) {
    if (transactional && typeof db?.rollbackTransaction === 'function') {
      try {
        await db.rollbackTransaction(req.transactionID as number | string)
      } catch {
        // The original error is more useful than a rollback failure.
      }
    }

    throw error
  }
}
