import { createPublicKey, type JsonWebKey, verify } from 'node:crypto'

import type { FetchJson } from './jwks.js'

import { DEFAULT_GITHUB_OIDC_ISSUER, DEFAULT_MAX_SKEW_SECONDS } from '../constants.js'
import { fetchJwks, findJwkByKid, getGithubOidcJwksUrl } from './jwks.js'
import { decodeJwt } from './jwt.js'

export type GitHubOidcErrorCode =
  | 'oidc_expired'
  | 'oidc_invalid_audience'
  | 'oidc_invalid_issuer'
  | 'oidc_invalid_token'
  | 'oidc_jwks_unavailable'
  | 'oidc_missing_claim'
  | 'oidc_missing_jti'
  | 'oidc_not_yet_valid'
  | 'oidc_owner_not_allowed'
  | 'oidc_pull_request_not_allowed'
  | 'oidc_ref_not_allowed'
  | 'oidc_repository_not_allowed'
  | 'oidc_workflow_not_allowed'

export type GitHubOidcClaims = {
  actor?: string
  aud: string | string[]
  environment?: string
  event_name?: string
  exp: number
  iat: number
  iss: string
  job_workflow_ref?: string
  jti: string
  nbf?: number
  ref: string
  repository: string
  repository_owner: string
  sha?: string
  sub: string
  workflow?: string
  workflow_ref?: string
}

export type GitHubOidcTrustedSource = {
  limitRepos?: boolean
  owner: string
  repositories?: string[]
}

export type GitHubOidcVerifyConfig = {
  allowedRefs?: string[]
  /** Docs-set repository binding (owner/repo or repo under the token owner). Empty = any trusted. */
  allowedRepositories?: string[]
  allowedWorkflowRefs?: string[]
  allowPullRequests?: boolean
  /**
   * Accept any `refs/tags/*` ref in addition to `allowedRefs`. Defaults to true, which
   * preserves the long-standing behavior used by release-triggered publish workflows.
   */
  allowTagRefs?: boolean
  audience: string
  enforceWorkflowRefs?: boolean
  issuer?: string
  jwksUrl?: string
  maxSkewSeconds?: number
  trustedSources: GitHubOidcTrustedSource[]
}

export type VerifiedGitHubOidcToken = {
  claims: GitHubOidcClaims
  expiresAt: Date
  keyId: string
}

export type VerifyGitHubOidcTokenResult =
  | {
      code: GitHubOidcErrorCode
      message: string
      ok: false
    }
  | {
      ok: true
      token: VerifiedGitHubOidcToken
    }

const isString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() !== ''

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(isString)

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const getStringClaim = (payload: Record<string, unknown>, claim: string): string | undefined => {
  const value = payload[claim]

  return isString(value) ? value : undefined
}

const getNumberClaim = (payload: Record<string, unknown>, claim: string): number | undefined => {
  const value = payload[claim]

  return isNumber(value) ? value : undefined
}

const getAudienceClaim = (payload: Record<string, unknown>): string | string[] | undefined => {
  const value = payload.aud

  if (isString(value) || isStringArray(value)) {
    return value
  }

  return undefined
}

const toClaims = (payload: Record<string, unknown>): GitHubOidcClaims | undefined => {
  const aud = getAudienceClaim(payload)
  const exp = getNumberClaim(payload, 'exp')
  const iat = getNumberClaim(payload, 'iat')
  const iss = getStringClaim(payload, 'iss')
  const jti = getStringClaim(payload, 'jti')
  const ref = getStringClaim(payload, 'ref')
  const repository = getStringClaim(payload, 'repository')
  const repositoryOwner = getStringClaim(payload, 'repository_owner')
  const sub = getStringClaim(payload, 'sub')

  if (
    !aud ||
    exp === undefined ||
    iat === undefined ||
    !iss ||
    !jti ||
    !ref ||
    !repository ||
    !repositoryOwner ||
    !sub
  ) {
    return undefined
  }

  return {
    actor: getStringClaim(payload, 'actor'),
    aud,
    environment: getStringClaim(payload, 'environment'),
    event_name: getStringClaim(payload, 'event_name'),
    exp,
    iat,
    iss,
    job_workflow_ref: getStringClaim(payload, 'job_workflow_ref'),
    jti,
    nbf: getNumberClaim(payload, 'nbf'),
    ref,
    repository,
    repository_owner: repositoryOwner,
    sha: getStringClaim(payload, 'sha'),
    sub,
    workflow: getStringClaim(payload, 'workflow'),
    workflow_ref: getStringClaim(payload, 'workflow_ref'),
  }
}

const issue = (code: GitHubOidcErrorCode, message: string): VerifyGitHubOidcTokenResult => ({
  code,
  message,
  ok: false,
})

const includesIfConfigured = (
  allowed: string[] | undefined,
  value: string | undefined,
): boolean => {
  if (!allowed || allowed.length === 0) {
    return true
  }

  return value !== undefined && allowed.includes(value)
}

const audienceMatches = (audience: string | string[], expected: string): boolean =>
  Array.isArray(audience) ? audience.includes(expected) : audience === expected

const getRepositoryName = (repository: string): string => {
  const [, name] = repository.split('/', 2)

  return name ?? repository
}

const isTagRef = (claims: GitHubOidcClaims): boolean => claims.ref.startsWith('refs/tags/')

const repositoryMatches = ({
  allowed,
  owner,
  repository,
}: {
  allowed: string
  owner: string
  repository: string
}): boolean => {
  const normalized = allowed.trim()

  if (!normalized) {
    return false
  }

  return normalized.includes('/')
    ? normalized.toLowerCase() === repository.toLowerCase()
    : `${owner}/${normalized}`.toLowerCase() === repository.toLowerCase()
}

/** True when a trusted-source record covers the token's owner/repository. */
export const githubOidcSourceMatches = ({
  repository,
  repositoryOwner,
  source,
}: {
  repository: string
  repositoryOwner: string
  source: GitHubOidcTrustedSource
}): boolean => {
  if (source.owner.toLowerCase() !== repositoryOwner.toLowerCase()) {
    return false
  }

  if (source.limitRepos !== true) {
    return true
  }

  return (source.repositories ?? []).some((allowedRepository) =>
    repositoryMatches({
      allowed: allowedRepository,
      owner: source.owner,
      repository,
    }),
  )
}

const findTrustedSource = ({
  repository,
  repositoryOwner,
  trustedSources,
}: {
  repository: string
  repositoryOwner: string
  trustedSources: GitHubOidcTrustedSource[]
}): GitHubOidcTrustedSource | undefined =>
  trustedSources.find((source) =>
    githubOidcSourceMatches({
      repository,
      repositoryOwner,
      source,
    }),
  )

const verifyJwtSignature = ({
  jwk,
  signature,
  signingInput,
}: {
  jwk: Record<string, unknown>
  signature: Buffer
  signingInput: string
}): boolean => {
  try {
    const publicKey = createPublicKey({
      format: 'jwk',
      key: jwk as JsonWebKey,
    })

    return verify('RSA-SHA256', Buffer.from(signingInput, 'utf8'), publicKey, signature)
  } catch {
    return false
  }
}

export type GitHubOidcIdentityConfig = Pick<
  GitHubOidcVerifyConfig,
  'audience' | 'issuer' | 'jwksUrl' | 'maxSkewSeconds' | 'trustedSources'
>

export type GitHubOidcPolicyConfig = Pick<
  GitHubOidcVerifyConfig,
  | 'allowedRefs'
  | 'allowedRepositories'
  | 'allowedWorkflowRefs'
  | 'allowPullRequests'
  | 'allowTagRefs'
  | 'enforceWorkflowRefs'
>

const findSigningKey = async ({
  fetchJson,
  kid,
  now,
  url,
}: {
  fetchJson?: FetchJson
  kid: string
  now: Date
  url: string
}): Promise<Record<string, unknown> | undefined> => {
  const jwk = findJwkByKid({
    jwks: await fetchJwks({
      fetchJson,
      now,
      url,
    }),
    kid,
  })

  if (jwk) {
    return jwk
  }

  // Unknown kid: the issuer may have rotated keys since the cached fetch (DOCS-16).
  return findJwkByKid({
    jwks: await fetchJwks({
      fetchJson,
      forceRefresh: true,
      now,
      url,
    }),
    kid,
  })
}

/**
 * Phase 1: proves the token is a valid GitHub OIDC token for `audience` from a trusted
 * owner/repository. Needs no docs-set data, so it runs before any docs-set lookup.
 */
export const verifyGitHubOidcIdentity = async ({
  config,
  fetchJson,
  now = new Date(),
  token,
}: {
  config: GitHubOidcIdentityConfig
  fetchJson?: FetchJson
  now?: Date
  token: string
}): Promise<VerifyGitHubOidcTokenResult> => {
  const decoded = decodeJwt(token)

  if (!decoded) {
    return issue('oidc_invalid_token', 'GitHub OIDC token is malformed.')
  }

  if (decoded.header.alg !== 'RS256') {
    return issue('oidc_invalid_token', 'GitHub OIDC token must use RS256.')
  }

  if (!isString(decoded.header.kid)) {
    return issue('oidc_invalid_token', 'GitHub OIDC token is missing kid.')
  }

  const issuer = config.issuer ?? DEFAULT_GITHUB_OIDC_ISSUER

  try {
    const jwksUrl = await getGithubOidcJwksUrl({
      fetchJson,
      issuer,
      jwksUrl: config.jwksUrl,
    })
    const jwk = await findSigningKey({
      fetchJson,
      kid: decoded.header.kid,
      now,
      url: jwksUrl,
    })

    if (
      !jwk ||
      !verifyJwtSignature({
        jwk,
        signature: decoded.signature,
        signingInput: decoded.signingInput,
      })
    ) {
      return issue('oidc_invalid_token', 'GitHub OIDC token signature is invalid.')
    }
  } catch {
    return issue('oidc_jwks_unavailable', 'GitHub OIDC signing keys are unavailable.')
  }

  if (!isString(decoded.payload.jti)) {
    return issue('oidc_missing_jti', 'GitHub OIDC token is missing jti.')
  }

  const claims = toClaims(decoded.payload)

  if (!claims) {
    return issue('oidc_missing_claim', 'GitHub OIDC token is missing a required claim.')
  }

  if (claims.iss !== issuer) {
    return issue('oidc_invalid_issuer', 'GitHub OIDC token issuer is not allowed.')
  }

  if (!audienceMatches(claims.aud, config.audience)) {
    return issue('oidc_invalid_audience', 'GitHub OIDC token audience is not allowed.')
  }

  const maxSkewSeconds = config.maxSkewSeconds ?? DEFAULT_MAX_SKEW_SECONDS
  const nowSeconds = now.getTime() / 1000

  if (claims.exp + maxSkewSeconds < nowSeconds) {
    return issue('oidc_expired', 'GitHub OIDC token has expired.')
  }

  if (claims.nbf !== undefined && claims.nbf - maxSkewSeconds > nowSeconds) {
    return issue('oidc_not_yet_valid', 'GitHub OIDC token is not valid yet.')
  }

  if (claims.iat - maxSkewSeconds > nowSeconds) {
    return issue('oidc_not_yet_valid', 'GitHub OIDC token was issued in the future.')
  }

  const trustedSources = config.trustedSources ?? []

  if (trustedSources.length === 0) {
    return issue('oidc_repository_not_allowed', 'GitHub OIDC auth requires a trusted GitHub owner.')
  }

  const trustedSource = findTrustedSource({
    repository: claims.repository,
    repositoryOwner: claims.repository_owner,
    trustedSources,
  })

  if (!trustedSource) {
    const matchingOwner = trustedSources.find(
      (source) => source.owner.toLowerCase() === claims.repository_owner.toLowerCase(),
    )

    if (matchingOwner) {
      return issue(
        'oidc_repository_not_allowed',
        `GitHub OIDC token repository "${claims.repository}" is not trusted for owner "${claims.repository_owner}".`,
      )
    }

    return issue(
      'oidc_owner_not_allowed',
      `GitHub OIDC token repository owner "${claims.repository_owner}" is not trusted.`,
    )
  }

  return {
    ok: true,
    token: {
      claims,
      // The token stays acceptable until exp + maxSkew, so its jti must be remembered
      // at least that long (DOCS-7).
      expiresAt: new Date((claims.exp + maxSkewSeconds) * 1000),
      keyId: `github-oidc:${claims.repository}`,
    },
  }
}

/**
 * Phase 2: docs-set policy (branch/tag refs, repository binding, workflow refs, pull
 * requests). Runs after the docs set is resolved.
 */
export type GitHubOidcPolicyResult =
  | {
      code: GitHubOidcErrorCode
      message: string
      ok: false
    }
  | {
      ok: true
    }

const policyIssue = (code: GitHubOidcErrorCode, message: string): GitHubOidcPolicyResult => ({
  code,
  message,
  ok: false,
})

export const checkGitHubOidcPolicy = ({
  claims,
  config,
}: {
  claims: GitHubOidcClaims
  config: GitHubOidcPolicyConfig
}): GitHubOidcPolicyResult => {
  const repositoryName = getRepositoryName(claims.repository)

  if (
    config.allowedRepositories &&
    config.allowedRepositories.length > 0 &&
    !config.allowedRepositories.some((allowed) =>
      repositoryMatches({
        allowed,
        owner: claims.repository_owner,
        repository: claims.repository,
      }),
    )
  ) {
    return policyIssue(
      'oidc_repository_not_allowed',
      `GitHub OIDC token repository "${claims.repository}" is not allowed to publish this docs set.`,
    )
  }

  const tagAllowed = config.allowTagRefs !== false && isTagRef(claims)

  if (!includesIfConfigured(config.allowedRefs, claims.ref) && !tagAllowed) {
    return policyIssue(
      'oidc_ref_not_allowed',
      `GitHub OIDC token ref "${claims.ref}" is not allowed for "${repositoryName}".`,
    )
  }

  const workflowRef = claims.workflow_ref ?? claims.job_workflow_ref

  if (config.enforceWorkflowRefs === true && (config.allowedWorkflowRefs?.length ?? 0) === 0) {
    return policyIssue(
      'oidc_workflow_not_allowed',
      'Advanced workflow security is enabled but no workflow refs are trusted.',
    )
  }

  if (
    config.enforceWorkflowRefs === true &&
    !includesIfConfigured(config.allowedWorkflowRefs, workflowRef)
  ) {
    return policyIssue(
      'oidc_workflow_not_allowed',
      'GitHub OIDC token workflow ref is not allowed.',
    )
  }

  if (claims.event_name === 'pull_request' && config.allowPullRequests !== true) {
    return policyIssue(
      'oidc_pull_request_not_allowed',
      'GitHub OIDC pull request events are not allowed.',
    )
  }

  return { ok: true }
}

export const verifyGitHubOidcToken = async ({
  config,
  fetchJson,
  now = new Date(),
  token,
}: {
  config: GitHubOidcVerifyConfig
  fetchJson?: FetchJson
  now?: Date
  token: string
}): Promise<VerifyGitHubOidcTokenResult> => {
  const identity = await verifyGitHubOidcIdentity({
    config,
    fetchJson,
    now,
    token,
  })

  if (!identity.ok) {
    return identity
  }

  const policy = checkGitHubOidcPolicy({
    claims: identity.token.claims,
    config,
  })

  return policy.ok ? identity : policy
}
