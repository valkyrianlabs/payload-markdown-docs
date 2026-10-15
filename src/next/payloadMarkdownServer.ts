import type * as PayloadMarkdownServerModule from 'payload-markdown/server'

/**
 * payload-markdown's server entry under whichever package name the app installed:
 * `payload-markdown` (preferred) or `@valkyrianlabs/payload-markdown`.
 *
 * Each import sits in its own `try` block on purpose. Turbopack and webpack accept an
 * unresolvable `import()` inside a `try` (webpack logs a "Module not found" warning for the
 * name that is not installed), but fail the build when it sits in a `catch` body or a
 * `.catch()` callback. A package.json "imports" fallback array does not help either: Node and
 * webpack only fall back on invalid targets, not on missing packages.
 */
type PayloadMarkdownServer = typeof PayloadMarkdownServerModule

let loaded: Promise<PayloadMarkdownServer> | undefined

const load = async (): Promise<PayloadMarkdownServer> => {
  let preferredError: unknown

  try {
    return await import('payload-markdown/server')
  } catch (error) {
    preferredError = error
  }

  try {
    return (await import('@valkyrianlabs/payload-markdown/server')) as PayloadMarkdownServer
  } catch (error) {
    throw new AggregateError(
      [preferredError, error],
      'payload-markdown-docs renders docs with payload-markdown: install payload-markdown (or @valkyrianlabs/payload-markdown).',
      { cause: preferredError },
    )
  }
}

export const loadPayloadMarkdownServer = (): Promise<PayloadMarkdownServer> => {
  loaded ??= load().catch((error: unknown) => {
    loaded = undefined
    throw error
  })

  return loaded
}
