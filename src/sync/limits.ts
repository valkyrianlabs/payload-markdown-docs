import { DEFAULT_MAX_BODY_BYTES } from '../constants.js'

/**
 * The binding size limit of the sync protocol is the UTF-8 byte length of the
 * serialized request body (the server answers 413 above `maxBodyBytes`).
 * Clients must measure the exact compact JSON they send; `pmdocs` and
 * `JSON.stringify` produce byte-identical output for the same manifest
 * (pinned by `contracts/vectors/limits.json`).
 */
export const DEFAULT_SYNC_MAX_BODY_BYTES = DEFAULT_MAX_BODY_BYTES

export const measureSyncBodyBytes = (body: string): number => Buffer.byteLength(body, 'utf8')

export const serializeSyncManifest = (manifest: unknown): string => JSON.stringify(manifest)
