export type FetchJson = (url: string) => Promise<unknown>

export type JsonWebKeyLike = Record<string, unknown>

export type JsonWebKeySet = {
  keys: JsonWebKeyLike[]
}

const JWKS_CACHE_TTL_MS = 5 * 60 * 1000

const jwksCache = new Map<
  string,
  {
    expiresAt: number
    jwks: JsonWebKeySet
  }
>()

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isJwks = (value: unknown): value is JsonWebKeySet =>
  isRecord(value) &&
  Array.isArray(value.keys) &&
  value.keys.every((key) => isRecord(key))

export const defaultFetchJson: FetchJson = async (url: string): Promise<unknown> => {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Could not fetch JSON from ${url}.`)
  }

  return response.json() as Promise<unknown>
}

export const getGithubOidcJwksUrl = async ({
  fetchJson = defaultFetchJson,
  issuer,
  jwksUrl,
}: {
  fetchJson?: FetchJson
  issuer: string
  jwksUrl?: string
}): Promise<string> => {
  if (jwksUrl) {
    return jwksUrl
  }

  const discoveryUrl = `${issuer.replace(/\/+$/g, '')}/.well-known/openid-configuration`
  const discovery = await fetchJson(discoveryUrl)

  if (!isRecord(discovery) || typeof discovery.jwks_uri !== 'string') {
    throw new Error('GitHub OIDC discovery response did not include jwks_uri.')
  }

  return discovery.jwks_uri
}

export const fetchJwks = async ({
  fetchJson = defaultFetchJson,
  now = new Date(),
  url,
}: {
  fetchJson?: FetchJson
  now?: Date
  url: string
}): Promise<JsonWebKeySet> => {
  const cached = jwksCache.get(url)

  if (cached && cached.expiresAt > now.getTime()) {
    return cached.jwks
  }

  const jwks = await fetchJson(url)

  if (!isJwks(jwks)) {
    throw new Error('GitHub OIDC JWKS response is invalid.')
  }

  jwksCache.set(url, {
    expiresAt: now.getTime() + JWKS_CACHE_TTL_MS,
    jwks,
  })

  return jwks
}

export const findJwkByKid = ({
  jwks,
  kid,
}: {
  jwks: JsonWebKeySet
  kid: string
}): JsonWebKeyLike | undefined =>
  jwks.keys.find((key) => key.kid === kid)
