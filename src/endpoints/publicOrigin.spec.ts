import { afterEach, describe, expect, it, vi } from 'vitest'

import { getPublicRequestOrigin } from './publicOrigin.js'

const request = (headers: Record<string, string>, serverURL?: string) =>
  ({
    headers: new Headers(headers),
    payload: { config: serverURL ? { serverURL } : {} },
    url: 'http://internal:3000/docs/llms.txt',
  }) as never

const envKeys = [
  'NEXT_PUBLIC_SERVER_URL',
  'NEXT_PUBLIC_SITE_URL',
  'SITE_URL',
  'VERCEL_PROJECT_PRODUCTION_URL',
  'VERCEL_URL',
]

describe('public origin for generated URLs (DOCS-18)', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  const clearEnv = () => envKeys.forEach((key) => vi.stubEnv(key, ''))

  it('prefers configured serverURL over Host and X-Forwarded-Host', () => {
    clearEnv()
    const req = request(
      { host: 'evil.example', 'x-forwarded-host': 'evil.example' },
      'https://docs.example.com',
    )

    expect(getPublicRequestOrigin(req)).toBe('https://docs.example.com')
    expect(getPublicRequestOrigin(req, { trustForwardedHeaders: true })).toBe(
      'https://docs.example.com',
    )
  })

  it('ignores forwarded headers unless trusted', () => {
    clearEnv()
    const req = request({ host: 'site.example', 'x-forwarded-host': 'evil.example' })

    expect(getPublicRequestOrigin(req)).toBe('http://site.example')
    expect(getPublicRequestOrigin(req, { trustForwardedHeaders: true })).toBe(
      'http://evil.example',
    )
  })

  it('prefers environment URLs over everything', () => {
    clearEnv()
    vi.stubEnv('NEXT_PUBLIC_SERVER_URL', 'https://public.example')

    expect(getPublicRequestOrigin(request({ host: 'evil.example' }, 'https://cms.example'))).toBe(
      'https://public.example',
    )
  })
})
