import {
  createPublicKey,
  type JsonWebKey,
  verify,
} from 'node:crypto'

import type { PayloadMarkdownDocsGitHubOidcAuthConfig } from '../types.js'
import type { FetchJson } from './jwks.js'

import {
  DEFAULT_GITHUB_OIDC_ISSUER,
  DEFAULT_MAX_SKEW_SECONDS,
} from '../constants.js'
import {
  fetchJwks,
  findJwkByKid,
  getGithubOidcJwksUrl,
} from './jwks.js'
import { decodeJwt } from './jwt.js'

export type GitHubOidcErrorCode =
  | 'oidc_environment_not_allowed'
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

type GitHubOidcAuthConfig = PayloadMarkdownDocsGitHubOidcAuthConfig

const isString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() !== ''

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(isString)

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const getStringClaim = (
  payload: Record<string, unknown>,
  claim: string,
): string | undefined => {
  const value = payload[claim]

  return isString(value) ? value : undefined
}

const getNumberClaim = (
  payload: Record<string, unknown>,
  claim: string,
): number | undefined => {
  const value = payload[claim]

  return isNumber(value) ? value : undefined
}

const getAudienceClaim = (
  payload: Record<string, unknown>,
): string | string[] | undefined => {
  const value = payload.aud

  if (isString(value) || isStringArray(value)) {
    return value
  }

  return undefined
}

const toClaims = (
  payload: Record<string, unknown>,
): GitHubOidcClaims | undefined => {
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

const issue = (
  code: GitHubOidcErrorCode,
  message: string,
): VerifyGitHubOidcTokenResult => ({
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

const audienceMatches = (
  audience: string | string[],
  expected: string,
): boolean =>
  Array.isArray(audience) ? audience.includes(expected) : audience === expected

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

    return verify(
      'RSA-SHA256',
      Buffer.from(signingInput, 'utf8'),
      publicKey,
      signature,
    )
  } catch {
    return false
  }
}

export const verifyGitHubOidcToken = async ({
  config,
  fetchJson,
  now = new Date(),
  token,
}: {
  config: GitHubOidcAuthConfig
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
  let jwksUrl: string

  try {
    jwksUrl = await getGithubOidcJwksUrl({
      fetchJson,
      issuer,
      jwksUrl: config.jwksUrl,
    })
    const jwks = await fetchJwks({
      fetchJson,
      now,
      url: jwksUrl,
    })
    const jwk = findJwkByKid({
      jwks,
      kid: decoded.header.kid,
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

  const hasRepositoryAllowlist =
    (config.allowedRepositories?.length ?? 0) > 0 ||
    (config.allowedRepositoryOwners?.length ?? 0) > 0

  if (!hasRepositoryAllowlist) {
    return issue(
      'oidc_repository_not_allowed',
      'GitHub OIDC auth requires an allowed repository or repository owner.',
    )
  }

  if (!includesIfConfigured(config.allowedRepositories, claims.repository)) {
    return issue(
      'oidc_repository_not_allowed',
      'GitHub OIDC token repository is not allowed.',
    )
  }

  if (!includesIfConfigured(config.allowedRepositoryOwners, claims.repository_owner)) {
    return issue(
      'oidc_owner_not_allowed',
      'GitHub OIDC token repository owner is not allowed.',
    )
  }

  if (!includesIfConfigured(config.allowedRefs, claims.ref)) {
    return issue('oidc_ref_not_allowed', 'GitHub OIDC token ref is not allowed.')
  }

  if (!includesIfConfigured(config.allowedWorkflows, claims.workflow)) {
    return issue(
      'oidc_workflow_not_allowed',
      'GitHub OIDC token workflow is not allowed.',
    )
  }

  const workflowRef = claims.workflow_ref ?? claims.job_workflow_ref

  if (!includesIfConfigured(config.allowedWorkflowRefs, workflowRef)) {
    return issue(
      'oidc_workflow_not_allowed',
      'GitHub OIDC token workflow ref is not allowed.',
    )
  }

  if (!includesIfConfigured(config.allowedEnvironments, claims.environment)) {
    return issue(
      'oidc_environment_not_allowed',
      'GitHub OIDC token environment is not allowed.',
    )
  }

  if (claims.event_name === 'pull_request' && config.allowPullRequests !== true) {
    return issue(
      'oidc_pull_request_not_allowed',
      'GitHub OIDC pull request events are not allowed.',
    )
  }

  return {
    ok: true,
    token: {
      claims,
      expiresAt: new Date(claims.exp * 1000),
      keyId: `github-oidc:${claims.repository}`,
    },
  }
}
