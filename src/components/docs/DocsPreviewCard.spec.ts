import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'

import { normalizeDocsPreviewItems } from '../../utilities/normalizeDocsPreviewItems.js'
import { DocsPreviewCard } from './DocsPreviewCard.js'

const stack = [
  { category: 'languages', items: [{ name: 'C++23' }, { name: 'TypeScript' }] },
  { category: 'libraries', items: [{ name: 'libfuse3' }, { name: 'libpqxx' }, { name: 'libsodium' }] },
  { category: 'build-tools', items: [{ name: 'Meson' }] },
]

const render = (input: unknown, layout?: 'cards' | 'compact' | 'featured' | 'list') => {
  const [item] = normalizeDocsPreviewItems([input])

  return renderToStaticMarkup(createElement(DocsPreviewCard, { item, layout }))
}

describe('DocsPreviewCard technology stack', () => {
  test('cards without a stack render exactly as before', () => {
    const markup = render({ excerpt: 'Read the docs.', reference: { stack: [], title: 'Docs' } }, 'compact')

    expect(markup).not.toContain('data-payload-markdown-docs-stack')
    expect(markup).toBe(
      '<article class="block rounded-xl border border-border bg-white/[0.04] shadow-sm shadow-slate-950/5 transition-colors p-4 hover:bg-white/[0.08]"><div class="flex items-start justify-between gap-4"><span class="font-semibold text-foreground text-sm">Docs</span></div><p class="mt-2 text-sm leading-6 text-foreground/65 line-clamp-2">Read the docs.</p></article>',
    )
  })

  test('takes the stack from a referenced docs set', () => {
    const [item] = normalizeDocsPreviewItems([{ reference: { relationTo: 'docs-sets', value: { stack, title: 'Vaulthalla' } } }])

    expect(item?.stack).toEqual(stack)
  })

  test('compact cards show a few pills and collapse the rest', () => {
    const markup = render({ reference: { stack, title: 'Vaulthalla' } }, 'compact')

    expect(markup.match(/<li /g)).toHaveLength(5)
    expect(markup).toContain('>C++23</li>')
    expect(markup).toContain('>libpqxx</li>')
    expect(markup).not.toContain('>libsodium</li>')
    expect(markup).toContain('title="libsodium, Meson">+2</li>')
  })

  test('featured cards group pills by category', () => {
    const markup = render({ reference: { stack, title: 'Vaulthalla' } }, 'featured')

    expect(markup).toContain('>Languages</dt>')
    expect(markup).toContain('>Build Tools</dt>')
    expect(markup).toContain('>libsodium</li>')
    expect(markup).not.toContain('>+')
  })
})
