import type { Config } from 'payload'

import { markdownField as scopedMarkdownField } from '@valkyrianlabs/payload-markdown'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { markdownField } from 'payload-markdown'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  findInstalledPayloadMarkdownPackage,
  payloadMarkdownField,
  resolvePayloadMarkdownPackage,
} from './payloadMarkdown.js'

describe('payload-markdown under either package name', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each([
    ['payload-markdown', markdownField],
    ['@valkyrianlabs/payload-markdown', scopedMarkdownField],
  ] as const)('builds the same field as %s markdownField()', (packageName, upstream) => {
    expect(payloadMarkdownField({ name: 'content', label: 'Content', packageName })).toEqual(
      upstream({ name: 'content', label: 'Content' }),
    )
  })

  it('prefers the explicit option', () => {
    expect(resolvePayloadMarkdownPackage({}, '@valkyrianlabs/payload-markdown')).toBe('@valkyrianlabs/payload-markdown')
  })

  it.each(['payload-markdown', '@valkyrianlabs/payload-markdown'])(
    'reads %s from component paths payloadMarkdown() put into the config',
    (name) => {
      const config = {
        blocks: [
          {
            slug: 'vlMdBlock',
            fields: [{ name: 'p', type: 'checkbox', admin: { components: { Field: `${name}/client#MarkdownBlockParamsEnableField` } } }],
          },
        ],
      } as unknown as Config

      expect(resolvePayloadMarkdownPackage(config)).toBe(name)
    },
  )

  it('falls back to the package installed above the working directory', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pmdocs-pm-name-'))
    const app = path.join(root, 'apps', 'site')

    try {
      fs.mkdirSync(path.join(root, 'node_modules', '@valkyrianlabs', 'payload-markdown'), { recursive: true })
      fs.writeFileSync(path.join(root, 'node_modules', '@valkyrianlabs', 'payload-markdown', 'package.json'), '{}')
      fs.mkdirSync(app, { recursive: true })

      expect(findInstalledPayloadMarkdownPackage(app)).toBe('@valkyrianlabs/payload-markdown')

      fs.mkdirSync(path.join(app, 'node_modules', 'payload-markdown'), { recursive: true })
      fs.writeFileSync(path.join(app, 'node_modules', 'payload-markdown', 'package.json'), '{}')

      expect(findInstalledPayloadMarkdownPackage(app)).toBe('payload-markdown')
      expect(findInstalledPayloadMarkdownPackage(os.tmpdir())).toBeUndefined()
    } finally {
      fs.rmSync(root, { force: true, recursive: true })
    }
  })

  it('defaults to payload-markdown', () => {
    vi.spyOn(process, 'cwd').mockReturnValue(os.tmpdir())

    expect(resolvePayloadMarkdownPackage({})).toBe('payload-markdown')
  })
})
