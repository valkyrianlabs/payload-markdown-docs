/**
 * Request intake: method check, bounded body read (DOCS-15), JSON manifest parse, and
 * the manifest source id, all before any database access.
 */
import type { PayloadRequest } from 'payload'

import type { DocsManifest } from '../../sync/index.js'

import { isRecord } from '../../shared/records.js'
import { rejectSync, SyncRequestError } from './respond.js'

export type SyncRequestBody = {
  manifest: DocsManifest
  rawBody: string
  sourceId: string
}

const SOURCE_ID_PATTERN = /^[a-z0-9][\w.-]{0,199}$/i

const parseManifestBody = (rawBody: string): DocsManifest | undefined => {
  try {
    const parsed = JSON.parse(rawBody) as unknown

    return isRecord(parsed) ? (parsed as DocsManifest) : undefined
  } catch {
    return undefined
  }
}

const getManifestSourceId = (manifest: DocsManifest): string | undefined => {
  const source = (manifest as { source?: unknown }).source
  const id = isRecord(source) ? source.id : undefined

  return typeof id === 'string' && SOURCE_ID_PATTERN.test(id) ? id : undefined
}

/**
 * Reads the request body without buffering more than `maxBytes` (DOCS-15). Uses the
 * Content-Length header and the body stream when available; falls back to `text()`.
 */
const readRequestBodyWithLimit = async (req: PayloadRequest, maxBytes: number): Promise<string> => {
  const tooLarge = (bytes: number, atLeast = false) =>
    new SyncRequestError('invalid_body', 'Sync request body is too large.', 413, {
      issues: [
        {
          code: 'body_too_large',
          message: `Body is ${atLeast ? 'more than ' : ''}${bytes} bytes; limit is ${maxBytes} bytes.`,
          severity: 'error',
        },
      ],
    })
  const contentLength = Number(req.headers?.get?.('content-length') ?? Number.NaN)

  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw tooLarge(contentLength)
  }

  const stream = (req as { body?: unknown }).body

  if (
    stream &&
    typeof stream === 'object' &&
    typeof (stream as ReadableStream<Uint8Array>).getReader === 'function'
  ) {
    const reader = (stream as ReadableStream<Uint8Array>).getReader()
    const chunks: Uint8Array[] = []
    let received = 0

    for (;;) {
      const { done, value } = await reader.read()

      if (done) {
        break
      }

      received += value.byteLength

      if (received > maxBytes) {
        await reader.cancel().catch(() => undefined)

        throw tooLarge(maxBytes, true)
      }

      chunks.push(value)
    }

    return Buffer.concat(chunks).toString('utf8')
  }

  if (typeof req.text !== 'function') {
    return rejectSync(
      'invalid_body',
      'Sync endpoint requires access to the request body text.',
      400,
    )
  }

  const text = await req.text()
  const bytes = Buffer.byteLength(text, 'utf8')

  if (bytes > maxBytes) {
    throw tooLarge(bytes)
  }

  return text
}

/** Method, size limit, JSON manifest, and source id checks (no database access). */
export const readSyncRequest = async (
  req: PayloadRequest,
  maxBodyBytes: number,
): Promise<SyncRequestBody> => {
  if (req.method && req.method.toUpperCase() !== 'POST') {
    rejectSync('invalid_method', 'Sync endpoint only accepts POST.', 405)
  }

  const rawBody = await readRequestBodyWithLimit(req, maxBodyBytes)
  const manifest = parseManifestBody(rawBody)

  if (!manifest) {
    return rejectSync('invalid_body', 'Sync request body must be a JSON manifest.', 400)
  }

  // Validated before any database access: the id selects the docs set and the OIDC
  // audience, so it must be a plain slug string (DOCS-15).
  const sourceId = getManifestSourceId(manifest)

  if (!sourceId) {
    return rejectSync(
      'source_not_allowed',
      'Manifest source.id is required and must be a docs set slug.',
      400,
    )
  }

  return {
    manifest,
    rawBody,
    sourceId,
  }
}
