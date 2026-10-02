/**
 * Public factory for the docs sync endpoint. The pipeline lives in ./sync/:
 * request intake (request.ts), authentication (authenticate.ts), docs-set resolution,
 * manifest validation and route checks (validate.ts), policy (policy.ts), planning
 * (plan.ts), transactional apply (apply.ts), sync-run audit (record.ts), cache
 * revalidation (revalidate.ts), and response shaping (respond.ts), orchestrated by
 * handler.ts.
 */
import type { Endpoint } from 'payload'

import type { CreateSyncEndpointOptions } from './sync/context.js'

import { createSyncEndpointHandler } from './sync/handler.js'

export type { CreateSyncEndpointOptions } from './sync/context.js'
export type { DocsSyncEndpointErrorCode, SyncErrorIssue } from './sync/respond.js'

export const createSyncEndpoint = (options: CreateSyncEndpointOptions): Endpoint => ({
  handler: createSyncEndpointHandler(options),
  method: 'post',
  path: options.endpointPath,
})
