import { afterEach, describe, expect, it, vi } from 'vitest'

const missing = (name: string) => () => {
  throw Object.assign(new Error(`Cannot find package '${name}'`), { code: 'ERR_MODULE_NOT_FOUND' })
}

describe('loadPayloadMarkdownServer', () => {
  afterEach(() => {
    vi.doUnmock('payload-markdown/server')
    vi.doUnmock('@valkyrianlabs/payload-markdown/server')
    vi.resetModules()
  })

  it('prefers payload-markdown', async () => {
    vi.doMock('payload-markdown/server', () => ({ MarkdownRenderer: 'unscoped' }))
    vi.doMock('@valkyrianlabs/payload-markdown/server', () => ({ MarkdownRenderer: 'scoped' }))
    const { loadPayloadMarkdownServer } = await import('./payloadMarkdownServer.js')

    expect((await loadPayloadMarkdownServer()).MarkdownRenderer).toBe('unscoped')
  })

  it('falls back to @valkyrianlabs/payload-markdown', async () => {
    vi.doMock('payload-markdown/server', missing('payload-markdown'))
    vi.doMock('@valkyrianlabs/payload-markdown/server', () => ({ MarkdownRenderer: 'scoped' }))
    const { loadPayloadMarkdownServer } = await import('./payloadMarkdownServer.js')

    expect((await loadPayloadMarkdownServer()).MarkdownRenderer).toBe('scoped')
  })

  it('names both packages when neither is installed, keeping the first error', async () => {
    vi.doMock('payload-markdown/server', missing('payload-markdown'))
    vi.doMock('@valkyrianlabs/payload-markdown/server', missing('@valkyrianlabs/payload-markdown'))
    const { loadPayloadMarkdownServer } = await import('./payloadMarkdownServer.js')

    const error = await loadPayloadMarkdownServer().catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(AggregateError)
    expect((error as AggregateError).message).toContain('install payload-markdown')
    expect((error as AggregateError).errors).toHaveLength(2)
    expect((error as AggregateError).cause).toBe((error as AggregateError).errors[0])
  })
})
