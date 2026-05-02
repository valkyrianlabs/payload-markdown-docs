import { generateKeyPairSync, randomUUID, sign  } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'

import type { PayloadMarkdownDocsAuthConfig } from '../types.js'
import type { FetchJson } from './jwks.js'

import {
  decodeJwt,
  toBase64Url,
  verifyGitHubOidcToken,
} from './index.js'

const now = new Date('2026-01-01T00:00:00.000Z')

const createRsaKeyPair = () =>
  generateKeyPairSync('rsa', {
    modulusLength: 2048,
  })

const createTokenFixture = (
  payloadOverrides: Record<string, unknown> = {},
  headerOverrides: Record<string, unknown> = {},
) => {
  const { privateKey, publicKey } = createRsaKeyPair()
  const kid = `kid-${randomUUID()}`
  const header = {
    alg: 'RS256',
    kid,
    typ: 'JWT',
    ...headerOverrides,
  }
  const payload = {
    actor: 'octocat',
    aud: 'payload-markdown-docs',
    event_name: 'push',
    exp: Math.floor(now.getTime() / 1000) + 600,
    iat: Math.floor(now.getTime() / 1000),
    iss: 'https://token.actions.githubusercontent.com',
    jti: `jti-${randomUUID()}`,
    ref: 'refs/heads/main',
    repository: 'valkyrianlabs/payload-markdown-docs',
    repository_owner: 'valkyrianlabs',
    sha: 'abc123',
    sub: 'repo:valkyrianlabs/payload-markdown-docs:ref:refs/heads/main',
    workflow: 'Publish docs',
    workflow_ref:
      'valkyrianlabs/payload-markdown-docs/.github/workflows/publish-docs.yml@refs/heads/main',
    ...payloadOverrides,
  }
  const encodedHeader = toBase64Url(JSON.stringify(header))
  const encodedPayload = toBase64Url(JSON.stringify(payload))
  const signature = sign(
    'RSA-SHA256',
    Buffer.from(`${encodedHeader}.${encodedPayload}`),
    privateKey,
  )
  const jwk = {
    ...publicKey.export({
      format: 'jwk',
    }),
    kid,
  } as Record<string, unknown>

  return {
    jwk,
    payload,
    token: `${encodedHeader}.${encodedPayload}.${toBase64Url(signature)}`,
  }
}

const config = (
  overrides: Partial<Extract<PayloadMarkdownDocsAuthConfig, { mode: 'github-oidc' }>> = {},
): Extract<PayloadMarkdownDocsAuthConfig, { mode: 'github-oidc' }> => ({
  allowedRepositories: ['valkyrianlabs/payload-markdown-docs'],
  audience: 'payload-markdown-docs',
  jwksUrl: `https://example.test/${randomUUID()}/jwks`,
  mode: 'github-oidc',
  ...overrides,
})

const fetchJsonForJwk = (jwk: Record<string, unknown>): FetchJson =>
  vi.fn(() => Promise.resolve({
    keys: [jwk],
  }))

describe('GitHub OIDC security helpers', () => {
  it('decodes JWT header and payload', () => {
    const { token } = createTokenFixture()
    const decoded = decodeJwt(token)

    expect(decoded?.header.alg).toBe('RS256')
    expect(decoded?.payload.repository).toBe(
      'valkyrianlabs/payload-markdown-docs',
    )
  })

  it('rejects malformed JWTs', async () => {
    const result = await verifyGitHubOidcToken({
      config: config(),
      now,
      token: 'not-a-jwt',
    })

    expect(result).toMatchObject({
      code: 'oidc_invalid_token',
      ok: false,
    })
  })

  it('verifies RS256 JWTs with an injected JWKS fetcher', async () => {
    const { jwk, token } = createTokenFixture()
    const result = await verifyGitHubOidcToken({
      config: config(),
      fetchJson: fetchJsonForJwk(jwk),
      now,
      token,
    })

    expect(result).toMatchObject({
      ok: true,
      token: {
        keyId: 'github-oidc:valkyrianlabs/payload-markdown-docs',
      },
    })

    if (result.ok) {
      expect(result.token.claims.actor).toBe('octocat')
      expect(result.token.claims.sha).toBe('abc123')
    }
  })

  it('rejects invalid issuer and audience claims', async () => {
    const issuerFixture = createTokenFixture({
      iss: 'https://example.invalid',
    })
    const audienceFixture = createTokenFixture({
      aud: 'wrong-audience',
    })

    await expect(
      verifyGitHubOidcToken({
        config: config(),
        fetchJson: fetchJsonForJwk(issuerFixture.jwk),
        now,
        token: issuerFixture.token,
      }),
    ).resolves.toMatchObject({ code: 'oidc_invalid_issuer', ok: false })
    await expect(
      verifyGitHubOidcToken({
        config: config(),
        fetchJson: fetchJsonForJwk(audienceFixture.jwk),
        now,
        token: audienceFixture.token,
      }),
    ).resolves.toMatchObject({ code: 'oidc_invalid_audience', ok: false })
  })

  it('rejects expired and not-yet-valid tokens', async () => {
    const expiredFixture = createTokenFixture({
      exp: Math.floor(now.getTime() / 1000) - 1_000,
    })
    const futureFixture = createTokenFixture({
      nbf: Math.floor(now.getTime() / 1000) + 1_000,
    })

    await expect(
      verifyGitHubOidcToken({
        config: config(),
        fetchJson: fetchJsonForJwk(expiredFixture.jwk),
        now,
        token: expiredFixture.token,
      }),
    ).resolves.toMatchObject({ code: 'oidc_expired', ok: false })
    await expect(
      verifyGitHubOidcToken({
        config: config(),
        fetchJson: fetchJsonForJwk(futureFixture.jwk),
        now,
        token: futureFixture.token,
      }),
    ).resolves.toMatchObject({ code: 'oidc_not_yet_valid', ok: false })
  })

  it('rejects missing required claims and missing jti deterministically', async () => {
    const missingRepository = createTokenFixture({
      repository: undefined,
    })
    const missingJti = createTokenFixture({
      jti: undefined,
    })

    await expect(
      verifyGitHubOidcToken({
        config: config(),
        fetchJson: fetchJsonForJwk(missingRepository.jwk),
        now,
        token: missingRepository.token,
      }),
    ).resolves.toMatchObject({ code: 'oidc_missing_claim', ok: false })
    await expect(
      verifyGitHubOidcToken({
        config: config(),
        fetchJson: fetchJsonForJwk(missingJti.jwk),
        now,
        token: missingJti.token,
      }),
    ).resolves.toMatchObject({ code: 'oidc_missing_jti', ok: false })
  })

  it('enforces repository, owner, ref, workflow, and environment allowlists', async () => {
    const { jwk, token } = createTokenFixture({
      environment: 'production',
    })

    await expect(
      verifyGitHubOidcToken({
        config: config({
          allowedRepositories: ['other/repo'],
        }),
        fetchJson: fetchJsonForJwk(jwk),
        now,
        token,
      }),
    ).resolves.toMatchObject({ code: 'oidc_repository_not_allowed', ok: false })
    await expect(
      verifyGitHubOidcToken({
        config: config({
          allowedRepositoryOwners: ['other'],
        }),
        fetchJson: fetchJsonForJwk(jwk),
        now,
        token,
      }),
    ).resolves.toMatchObject({ code: 'oidc_owner_not_allowed', ok: false })
    await expect(
      verifyGitHubOidcToken({
        config: config({
          allowedRefs: ['refs/heads/release'],
        }),
        fetchJson: fetchJsonForJwk(jwk),
        now,
        token,
      }),
    ).resolves.toMatchObject({ code: 'oidc_ref_not_allowed', ok: false })
    await expect(
      verifyGitHubOidcToken({
        config: config({
          allowedWorkflows: ['Other workflow'],
        }),
        fetchJson: fetchJsonForJwk(jwk),
        now,
        token,
      }),
    ).resolves.toMatchObject({ code: 'oidc_workflow_not_allowed', ok: false })
    await expect(
      verifyGitHubOidcToken({
        config: config({
          allowedEnvironments: ['staging'],
        }),
        fetchJson: fetchJsonForJwk(jwk),
        now,
        token,
      }),
    ).resolves.toMatchObject({ code: 'oidc_environment_not_allowed', ok: false })
  })

  it('rejects pull request events by default and allows them when configured', async () => {
    const { jwk, token } = createTokenFixture({
      event_name: 'pull_request',
    })

    await expect(
      verifyGitHubOidcToken({
        config: config(),
        fetchJson: fetchJsonForJwk(jwk),
        now,
        token,
      }),
    ).resolves.toMatchObject({ code: 'oidc_pull_request_not_allowed', ok: false })
    await expect(
      verifyGitHubOidcToken({
        config: config({
          allowPullRequests: true,
        }),
        fetchJson: fetchJsonForJwk(jwk),
        now,
        token,
      }),
    ).resolves.toMatchObject({ ok: true })
  })
})
