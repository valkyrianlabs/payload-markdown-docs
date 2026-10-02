/**
 * Authentication: Ed25519 signed requests or GitHub Actions OIDC tokens, each with
 * one-time nonce consumption (replay protection). Runs before the docs set is looked
 * up so unauthenticated callers cannot probe which docs sets exist (DOCS-15).
 */
import type { ScopedGitHubOidcTrustedSource } from '../../payload/index.js'
import type { GitHubOidcClaims } from '../../security/index.js'
import type { SyncRequestContext } from './context.js'

import { DEFAULT_MAX_SKEW_SECONDS, DEFAULT_NONCE_TTL_SECONDS } from '../../constants.js'
import {
  findDocsKeyById,
  findTrustedGitHubSources,
  isEd25519AuthEnabled,
  isGitHubOidcAuthEnabled,
} from '../../payload/index.js'
import {
  buildCanonicalSigningString,
  consumeNonce,
  extractSyncRequestHeaders,
  getCanonicalPathFromRequestUrl,
  githubOidcSourceMatches,
  validateTimestampSkew,
  verifyBodySha256,
  verifyEd25519Signature,
  verifyGitHubOidcIdentity,
} from '../../security/index.js'
import { rejectSync } from './respond.js'

/** The authenticated caller of a sync request. */
export type SyncIdentity = {
  actor?: string
  bodyHash: string
  branch?: string
  commit?: string
  /** Ed25519 key scope: docs set ids this key may sync (empty = all, deprecated). */
  ed25519DocsSetIds?: string[]
  keyId: string
  nonce: string
  /** Present for GitHub OIDC requests; docs-set policy is checked after lookup. */
  oidcClaims?: GitHubOidcClaims
  /** Access records that trusted the OIDC token, with their docs-set scopes. */
  oidcTrustedSources?: ScopedGitHubOidcTrustedSource[]
  repository?: string
}

type AuthenticateInput = {
  context: SyncRequestContext
  rawBody: string
  sourceId: string
}

const getRequiredHeader = (headers: Headers, name: string): string | undefined => {
  const value = headers.get(name)

  return value && value.trim() !== '' ? value.trim() : undefined
}

const getBearerToken = (headers: Headers): string | undefined => {
  const authorization = getRequiredHeader(headers, 'authorization')

  if (!authorization) {
    return undefined
  }

  const [scheme, token] = authorization.split(/\s+/, 2)

  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return ''
  }

  return token
}

const hasEd25519AuthHeaders = (headers: Headers): boolean =>
  getRequiredHeader(headers, 'x-vl-md-docs-key-id') !== undefined ||
  getRequiredHeader(headers, 'x-vl-md-docs-signature') !== undefined ||
  getRequiredHeader(headers, 'x-vl-md-docs-timestamp') !== undefined ||
  getRequiredHeader(headers, 'x-vl-md-docs-nonce') !== undefined

const assertReplayProtectionAvailable = ({ options }: SyncRequestContext): void => {
  if (!options.noncesEnabled) {
    rejectSync(
      'replay_protection_unavailable',
      'Sync endpoint requires nonce replay protection.',
      500,
    )
  }
}

const authenticateEd25519Request = async ({
  context,
  rawBody,
  sourceId,
}: AuthenticateInput): Promise<SyncIdentity> => {
  const { options, payload, req, startedAt: now } = context
  const headersResult = extractSyncRequestHeaders(req.headers)

  if (!headersResult.ok) {
    return rejectSync(
      'missing_header',
      `Missing required sync header: ${headersResult.header}.`,
      401,
    )
  }

  if (!options.docsAccessEnabled) {
    rejectSync(
      'auth_disabled',
      'Signed sync authentication requires the docs Access collection.',
      401,
    )
  }

  const keyConfig = await findDocsKeyById({
    collectionSlug: options.docsAccessCollectionSlug,
    keyId: headersResult.headers.keyId,
    payload,
  })

  if (!keyConfig) {
    return rejectSync('unknown_key', 'Unknown sync request key id.', 401)
  }

  const bodyHash = verifyBodySha256({
    body: rawBody,
    expectedHash: headersResult.headers.bodySha256,
  })

  if (!bodyHash.ok) {
    rejectSync(
      'body_hash_mismatch',
      'Sync request body hash does not match the signed header.',
      401,
    )
  }

  const timestampValidation = validateTimestampSkew({
    maxSkewSeconds: options.maxSkewSeconds ?? DEFAULT_MAX_SKEW_SECONDS,
    now,
    timestamp: headersResult.headers.timestamp,
  })

  if (!timestampValidation.ok) {
    rejectSync('invalid_timestamp', timestampValidation.message, 401)
  }

  assertReplayProtectionAvailable(context)

  const canonicalPath = getCanonicalPathFromRequestUrl({
    endpointPath: options.endpointPath,
    url: req.url,
  })
  const canonicalString = buildCanonicalSigningString({
    bodySha256: bodyHash.computedHash,
    method: 'POST',
    nonce: headersResult.headers.nonce,
    path: canonicalPath,
    timestamp: headersResult.headers.timestamp,
  })

  if (
    !verifyEd25519Signature({
      canonicalString,
      publicKey: keyConfig.publicKey,
      signature: headersResult.headers.signature,
    })
  ) {
    rejectSync('invalid_signature', 'Invalid sync request signature.', 401)
  }

  const maxSkewSeconds = options.maxSkewSeconds ?? DEFAULT_MAX_SKEW_SECONDS
  const nonceTtlSeconds = options.nonceTtlSeconds ?? DEFAULT_NONCE_TTL_SECONDS
  const signedAt = Date.parse(headersResult.headers.timestamp)
  // Remember the nonce at least until the signed timestamp leaves the accepted skew
  // window, plus a second of margin (DOCS-7).
  const expiresAt = new Date(
    Math.max(now.getTime() + nonceTtlSeconds * 1000, signedAt + maxSkewSeconds * 1000) + 1000,
  )
  const consumed = await consumeNonce({
    bodyHash: bodyHash.computedHash,
    collectionSlug: options.noncesCollectionSlug,
    expiresAt,
    keyId: headersResult.headers.keyId,
    nonce: headersResult.headers.nonce,
    now,
    payload,
    sourceId,
  })

  if (!consumed) {
    rejectSync('nonce_replay', 'Sync request nonce has already been used.', 409)
  }

  return {
    bodyHash: bodyHash.computedHash,
    ed25519DocsSetIds: keyConfig.docsSetIds,
    keyId: headersResult.headers.keyId,
    nonce: headersResult.headers.nonce,
  }
}

const authenticateGitHubOidcRequest = async ({
  context,
  rawBody,
  sourceId,
}: AuthenticateInput): Promise<SyncIdentity> => {
  const { options, payload, req, startedAt: now } = context
  const token = getBearerToken(req.headers)

  if (token === undefined) {
    return rejectSync('missing_header', 'Missing required sync header: Authorization.', 401)
  }

  if (token === '') {
    rejectSync('oidc_invalid_token', 'Authorization must be a Bearer GitHub OIDC token.', 401)
  }

  const expectedHash = getRequiredHeader(req.headers, 'x-vl-md-docs-body-sha256')

  if (!expectedHash) {
    return rejectSync(
      'missing_header',
      'Missing required sync header: X-VL-MD-DOCS-Body-SHA256.',
      401,
    )
  }

  const bodyHash = verifyBodySha256({
    body: rawBody,
    expectedHash,
  })

  if (!bodyHash.ok) {
    rejectSync(
      'body_hash_mismatch',
      'Sync request body hash does not match the OIDC header.',
      401,
    )
  }

  if (!options.docsAccessEnabled) {
    rejectSync(
      'auth_disabled',
      'GitHub OIDC sync authentication requires the docs Access collection.',
      401,
    )
  }

  const trustedSources = await findTrustedGitHubSources({
    collectionSlug: options.docsAccessCollectionSlug,
    payload,
  })
  // Identity only: the docs set is not looked up until the caller is authenticated.
  // The audience must still equal the manifest source id (the docs set slug).
  const verified = await verifyGitHubOidcIdentity({
    config: {
      audience: sourceId,
      maxSkewSeconds: options.maxSkewSeconds,
      trustedSources,
    },
    fetchJson: options.oidcFetchJson,
    now,
    token,
  })

  if (!verified.ok) {
    return rejectSync(
      verified.code,
      verified.message,
      verified.code === 'oidc_jwks_unavailable' ? 503 : 401,
    )
  }

  assertReplayProtectionAvailable(context)

  const consumed = await consumeNonce({
    bodyHash: bodyHash.computedHash,
    collectionSlug: options.noncesCollectionSlug,
    expiresAt: verified.token.expiresAt,
    keyId: verified.token.keyId,
    nonce: verified.token.claims.jti,
    now,
    payload,
    sourceId,
  })

  if (!consumed) {
    rejectSync('oidc_replay', 'GitHub OIDC token jti has already been used.', 409)
  }

  return {
    actor: verified.token.claims.actor,
    bodyHash: bodyHash.computedHash,
    branch: verified.token.claims.ref,
    commit: verified.token.claims.sha,
    keyId: verified.token.keyId,
    nonce: verified.token.claims.jti,
    oidcClaims: verified.token.claims,
    oidcTrustedSources: trustedSources.filter((source) =>
      githubOidcSourceMatches({
        repository: verified.token.claims.repository,
        repositoryOwner: verified.token.claims.repository_owner,
        source,
      }),
    ),
    repository: verified.token.claims.repository,
  }
}

/**
 * Picks the configured scheme from the request headers (a Bearer token means OIDC,
 * signing headers mean Ed25519) and authenticates the caller.
 */
export const authenticateSyncRequest = async (input: AuthenticateInput): Promise<SyncIdentity> => {
  const { options, req } = input.context
  const ed25519Enabled = isEd25519AuthEnabled(options.auth)
  const githubOidcEnabled = isGitHubOidcAuthEnabled(options.auth)

  if (!ed25519Enabled && !githubOidcEnabled) {
    rejectSync('auth_disabled', 'Sync authentication is not configured for this endpoint.', 401)
  }

  const bearerToken = getBearerToken(req.headers)

  if (bearerToken !== undefined) {
    if (!githubOidcEnabled) {
      rejectSync(
        'auth_disabled',
        'GitHub OIDC sync authentication is not configured for this endpoint.',
        401,
      )
    }

    return authenticateGitHubOidcRequest(input)
  }

  if (hasEd25519AuthHeaders(req.headers) || !githubOidcEnabled) {
    if (!ed25519Enabled) {
      rejectSync(
        'auth_disabled',
        'Signed sync authentication is not configured for this endpoint.',
        401,
      )
    }

    return authenticateEd25519Request(input)
  }

  return authenticateGitHubOidcRequest(input)
}
