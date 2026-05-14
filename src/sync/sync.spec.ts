import { describe, expect, test } from 'vitest'

import {
  buildDocsManifest,
  deriveRouteFromSourcePath,
  normalizeDocsPath,
  parseDocsFrontmatter,
  planDocsSync,
  sha256Hex,
  validateDocsManifest,
} from './index.js'

const expectValidManifest = (manifest: unknown) => {
  const result = validateDocsManifest(manifest, {
    allowedSourceIds: ['main-docs'],
    routeBase: '/docs',
  })

  expect(result.ok).toBe(true)

  if (!result.ok) {
    throw new Error(`Expected valid manifest, got ${JSON.stringify(result.issues)}`)
  }

  return result.data
}

describe('docs path normalization', () => {
  test('accepts index.md', () => {
    expect(normalizeDocsPath('index.md')).toMatchObject({
      ok: true,
      path: 'index.md',
      routeSegments: [],
    })
  })

  test('accepts nested markdown paths', () => {
    expect(normalizeDocsPath('getting-started/installation.md')).toMatchObject({
      ok: true,
      path: 'getting-started/installation.md',
      routeSegments: ['getting-started', 'installation'],
    })
  })

  test('strips leading current directory and collapses duplicate slashes', () => {
    expect(normalizeDocsPath('./configuration//themes.md')).toMatchObject({
      ok: true,
      path: 'configuration/themes.md',
      routeSegments: ['configuration', 'themes'],
    })
  })

  test('rejects absolute POSIX paths', () => {
    expect(normalizeDocsPath('/docs/index.md')).toMatchObject({
      code: 'invalid_path',
      ok: false,
    })
  })

  test('rejects absolute Windows drive paths', () => {
    expect(normalizeDocsPath('C:\\Users\\me\\docs.md')).toMatchObject({
      code: 'invalid_path',
      ok: false,
    })
  })

  test('rejects traversal paths', () => {
    expect(normalizeDocsPath('getting-started/../../secret.md')).toMatchObject({
      code: 'path_traversal',
      ok: false,
    })
  })

  test('rejects non-markdown files and empty paths', () => {
    expect(normalizeDocsPath('themes.mdx')).toMatchObject({
      code: 'non_markdown_file',
      ok: false,
    })
    expect(normalizeDocsPath('')).toMatchObject({
      code: 'invalid_path',
      ok: false,
    })
  })
})

describe('docs route derivation', () => {
  test('routes index.md to route base', () => {
    expect(
      deriveRouteFromSourcePath({
        routeBase: '/docs',
        sourcePath: 'index.md',
      }),
    ).toBe('/docs')
  })

  test('routes docs/index.md to route base', () => {
    expect(
      deriveRouteFromSourcePath({
        routeBase: '/docs/',
        sourcePath: 'docs/index.md',
      }),
    ).toBe('/docs')
  })

  test('routes nested docs and supports routeBase normalization', () => {
    expect(
      deriveRouteFromSourcePath({
        routeBase: 'docs/',
        sourcePath: 'getting-started/install.md',
      }),
    ).toBe('/docs/getting-started/install')
  })

  test('frontmatter slug overrides only final segment', () => {
    expect(
      deriveRouteFromSourcePath({
        slug: 'setup',
        routeBase: '/docs',
        sourcePath: 'getting-started/install.md',
      }),
    ).toBe('/docs/getting-started/setup')
  })
})

describe('docs hashing and manifest building', () => {
  test('computes stable SHA-256 hex hashes', () => {
    expect(sha256Hex('hello')).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    )
  })

  test('buildDocsManifest inserts file hashes', () => {
    const manifest = buildDocsManifest({
      files: [
        {
          content: '# Install\n',
          path: 'install.md',
        },
      ],
      sourceId: 'main-docs',
    })

    expect(manifest.files[0]?.sha256).toBe(sha256Hex('# Install\n'))
  })
})

describe('docs frontmatter parsing', () => {
  test('parses supported scalar fields', () => {
    const parsed = parseDocsFrontmatter(`---
title: Installation
navTitle: Install
description: Install payload-markdown.
order: 10
draft: false
status: published
slug: installation
---

# Ignored`)

    expect(parsed.issues).toEqual([])
    expect(parsed.frontmatter).toMatchObject({
      slug: 'installation',
      description: 'Install payload-markdown.',
      draft: false,
      navTitle: 'Install',
      order: 10,
      status: 'published',
      title: 'Installation',
    })
  })

  test('parses array fields', () => {
    const parsed = parseDocsFrontmatter(`---
redirectFrom:
  - /docs/install
tags:
  - getting-started
---

# Install`)

    expect(parsed.frontmatter.redirectFrom).toEqual(['/docs/install'])
    expect(parsed.frontmatter.tags).toEqual(['getting-started'])
  })

  test('supports files without frontmatter', () => {
    const parsed = parseDocsFrontmatter('# Installation\n\nBody')

    expect(parsed.frontmatter).toEqual({})
    expect(parsed.content).toBe('# Installation\n\nBody')
  })

  test('warns on unknown fields', () => {
    const parsed = parseDocsFrontmatter(`---
unknown: value
---

# Install`)

    expect(parsed.warnings).toMatchObject([
      {
        code: 'invalid_frontmatter',
      },
    ])
  })

  test('reports invalid status and order deterministically', () => {
    const parsed = parseDocsFrontmatter(`---
status: live
order: first
---

# Install`)

    expect(parsed.issues.map((issue) => issue.message)).toEqual([
      'Frontmatter field "status" must be "draft" or "published".',
      'Frontmatter field "order" must be a number.',
    ])
  })
})

describe('docs manifest validation', () => {
  test('validates a good manifest with derived route title and hash', () => {
    const data = expectValidManifest({
      files: [
        {
          content: `---
slug: setup
---

# Install
`,
          path: 'getting-started/install.md',
        },
      ],
      source: {
        id: 'main-docs',
      },
      version: 1,
    })

    expect(data.mode).toBe('dry-run')
    expect(data.deleteBehavior).toBe('archive')
    expect(data.publish).toBe(false)
    expect(data.files[0]).toMatchObject({
      path: 'getting-started/install.md',
      route: '/docs/getting-started/setup',
      title: 'Install',
    })
    expect(data.files[0]?.sha256).toBe(
      sha256Hex(`---
slug: setup
---

# Install
`),
    )
  })

  test('title falls back to filename when there is no frontmatter title or H1', () => {
    const data = expectValidManifest({
      files: [
        {
          content: 'Body only',
          path: 'getting-started/quick-start.md',
        },
      ],
      source: {
        id: 'main-docs',
      },
      version: 1,
    })

    expect(data.files[0]?.title).toBe('Quick Start')
  })

  test('rejects invalid version and empty files', () => {
    const result = validateDocsManifest({
      files: [],
      source: {
        id: 'main-docs',
      },
      version: 2,
    })

    expect(result.ok).toBe(false)
    expect(result.issues.map((issue) => issue.code)).toEqual(['invalid_version', 'empty_manifest'])
  })

  test('rejects duplicate normalized paths', () => {
    const result = validateDocsManifest({
      files: [
        {
          content: '# A',
          path: './intro.md',
        },
        {
          content: '# B',
          path: 'intro.md',
        },
      ],
      source: {
        id: 'main-docs',
      },
      version: 1,
    })

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: 'duplicate_path',
        path: 'intro.md',
      }),
    )
  })

  test('rejects invalid hash', () => {
    const result = validateDocsManifest({
      files: [
        {
          content: '# A',
          path: 'intro.md',
          sha256: 'bad',
        },
      ],
      source: {
        id: 'main-docs',
      },
      version: 1,
    })

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: 'invalid_hash',
      }),
    )
  })

  test('enforces allowed source IDs', () => {
    const result = validateDocsManifest(
      {
        files: [
          {
            content: '# A',
            path: 'intro.md',
          },
        ],
        source: {
          id: 'other-docs',
        },
        version: 1,
      },
      {
        allowedSourceIds: ['main-docs'],
      },
    )

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: 'invalid_source',
      }),
    )
  })

  test('enforces file count, file size, and total size limits', () => {
    const tooManyFiles = validateDocsManifest(
      {
        files: [
          {
            content: '# A',
            path: 'a.md',
          },
          {
            content: '# B',
            path: 'b.md',
          },
        ],
        source: {
          id: 'main-docs',
        },
        version: 1,
      },
      {
        maxFiles: 1,
      },
    )

    expect(tooManyFiles.issues).toContainEqual(
      expect.objectContaining({
        code: 'too_many_files',
      }),
    )

    const tooLarge = validateDocsManifest(
      {
        files: [
          {
            content: 'abcd',
            path: 'a.md',
          },
        ],
        source: {
          id: 'main-docs',
        },
        version: 1,
      },
      {
        maxFileBytes: 3,
        maxTotalBytes: 3,
      },
    )

    expect(tooLarge.issues.map((issue) => issue.code)).toEqual([
      'file_too_large',
      'manifest_too_large',
    ])
  })
})

describe('docs dry sync planning', () => {
  const desired = expectValidManifest({
    files: [
      {
        content: '# New',
        path: 'new.md',
      },
      {
        content: '# Changed',
        path: 'changed.md',
      },
      {
        content: '# Same',
        path: 'same.md',
      },
    ],
    source: {
      id: 'main-docs',
    },
    version: 1,
  })

  test('plans create update unchanged and archive by default', () => {
    const plan = planDocsSync({
      desired,
      existing: [
        {
          route: '/docs/changed',
          sourceHash: 'old-hash',
          sourcePath: 'changed.md',
        },
        {
          route: '/docs/same',
          sourceHash: desired.files.find((file) => file.path === 'same.md')?.sha256,
          sourcePath: 'same.md',
        },
        {
          route: '/docs/old',
          sourceHash: 'old',
          sourcePath: 'old.md',
        },
      ],
    })

    expect(plan.create).toHaveLength(1)
    expect(plan.update).toHaveLength(1)
    expect(plan.unchanged).toHaveLength(1)
    expect(plan.archive).toHaveLength(1)
  })

  test('plans status-only updates when publish state changes', () => {
    const publishedDesired = {
      ...desired,
      publish: true,
    }
    const sameFile = publishedDesired.files.find((file) => file.path === 'same.md')
    const plan = planDocsSync({
      desired: publishedDesired,
      existing: [
        {
          route: '/docs/same',
          sourceHash: sameFile?.sha256,
          sourcePath: 'same.md',
          status: 'draft',
        },
      ],
    })

    expect(plan.update).toHaveLength(1)
    expect(plan.update[0]?.reason).toBe('Existing draft status differs from desired publish state.')
    expect(plan.unchanged).toHaveLength(0)
  })

  test('plans route-only updates when the resolved route base changes', () => {
    const sameFile = desired.files.find((file) => file.path === 'same.md')
    const plan = planDocsSync({
      desired,
      existing: [
        {
          route: '/old-docs/same',
          sourceHash: sameFile?.sha256,
          sourcePath: 'same.md',
        },
      ],
    })

    expect(plan.update).toHaveLength(1)
    expect(plan.update[0]?.reason).toBe('Existing route differs from desired route.')
    expect(plan.unchanged).toHaveLength(0)
  })

  test('ignores missing existing docs when deleteBehavior is ignore', () => {
    const plan = planDocsSync({
      deleteBehavior: 'ignore',
      desired,
      existing: [
        {
          route: '/docs/old',
          sourcePath: 'old.md',
        },
      ],
    })

    expect(plan.archive).toHaveLength(0)
    expect(plan.delete).toHaveLength(0)
    expect(plan.draft).toHaveLength(0)
  })

  test('plans delete and draft categories when selected', () => {
    const existing = [
      {
        route: '/docs/old',
        sourcePath: 'old.md',
      },
    ]

    expect(
      planDocsSync({
        deleteBehavior: 'delete',
        desired,
        existing,
      }).delete,
    ).toHaveLength(1)

    expect(
      planDocsSync({
        deleteBehavior: 'draft',
        desired,
        existing,
      }).draft,
    ).toHaveLength(1)
  })

  test('warns on duplicate existing source paths', () => {
    const plan = planDocsSync({
      desired,
      existing: [
        {
          route: '/docs/a',
          sourcePath: 'duplicate.md',
        },
        {
          route: '/docs/b',
          sourcePath: 'duplicate.md',
        },
      ],
    })

    expect(plan.warnings).toContainEqual(
      expect.objectContaining({
        code: 'duplicate_existing_path',
        path: 'duplicate.md',
      }),
    )
  })
})
