/**
 * Runs the shared TS <-> C++ protocol vectors in `contracts/vectors/` against
 * the server implementation. The native CLI runs the same files from
 * `cli/tests/contract_tests.cpp`. See `contracts/README.md`.
 */
import { createPublicKey, verify } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

import { buildCanonicalSigningString } from '../security/canonical.js'
import { signDocsSyncRequest } from '../security/sign.js'
import {
  checkDocsRouteSegments,
  deriveRouteFromSourcePath,
  findManifestRouteCollisions,
  getDocsAssetContentTypeForPath,
  inferTitleFromMarkdown,
  isAllowedDocsAssetContentType,
  measureSyncBodyBytes,
  normalizeDocsPath,
  parseDocsFrontmatter,
  resolveAssetRoute,
  resolveDocsTitle,
  serializeSyncManifest,
  sha256Hex,
  titleFromSourcePath,
  validateDocsManifest,
} from './index.js'

const vectorsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../contracts/vectors')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const load = (name: string): any => {
  const data = JSON.parse(fs.readFileSync(path.join(vectorsDir, name), 'utf8'))

  expect(data.contractVersion).toBe(1)

  return data
}

const issueList = (
  issues: Array<{ code: string; message: string; path?: string }>,
  withMessage: boolean,
) =>
  issues.map((issue) => ({
    code: issue.code,
    ...(withMessage ? { message: issue.message } : {}),
    ...(issue.path !== undefined ? { path: issue.path } : {}),
  }))

describe('contract vectors: routes', () => {
  const vectors = load('routes.json')

  test.each(vectors.cases)('$name', (testCase) => {
    const normalized = normalizeDocsPath(testCase.sourcePath)

    if ('error' in testCase.expect) {
      expect(normalized).toMatchObject({ code: testCase.expect.error, ok: false })
      return
    }

    const input = {
      slug: testCase.slug,
      routeBase: testCase.routeBase,
      sourcePath: testCase.sourcePath,
    }
    const check = checkDocsRouteSegments(input)

    expect({
      path: normalized.ok ? normalized.path : undefined,
      route: deriveRouteFromSourcePath(input),
      unservableSegments: check.unservable,
      whitespaceSegments: check.whitespace,
    }).toEqual(testCase.expect)
  })
})

describe('contract vectors: titles', () => {
  const vectors = load('titles.json')

  test.each(vectors.infer)('infer: $name', (testCase) => {
    expect(inferTitleFromMarkdown(testCase.markdown) ?? null).toBe(testCase.expect)
  })

  test.each(vectors.sourcePath)('source path: $sourcePath', (testCase) => {
    expect(titleFromSourcePath(testCase.sourcePath)).toBe(testCase.expect)
  })

  test.each(vectors.resolve)('resolve: $name', (testCase) => {
    const parsed = parseDocsFrontmatter(testCase.markdown, { path: testCase.sourcePath })

    expect(
      resolveDocsTitle({
        content: parsed.content,
        frontmatter: parsed.frontmatter,
        sourcePath: testCase.sourcePath,
      }),
    ).toBe(testCase.expect)
  })
})

describe('contract vectors: frontmatter', () => {
  const vectors = load('frontmatter.json')

  test.each(vectors.cases)('$name', (testCase) => {
    const parsed = parseDocsFrontmatter(testCase.markdown)

    expect({
      content: parsed.content,
      // JSON round-trip: -0 serializes as 0, exactly like the wire format.
      frontmatter: JSON.parse(JSON.stringify(parsed.frontmatter)),
      issues: issueList(parsed.issues, true),
      warnings: issueList(parsed.warnings, true),
    }).toEqual(testCase.expect)
  })
})

describe('contract vectors: asset routes', () => {
  const vectors = load('asset-routes.json')

  test.each(vectors.cases)('$name', (testCase) => {
    const result = resolveAssetRoute(testCase)

    expect(
      result.ok
        ? { route: result.route ?? null, warning: result.warning?.code ?? null }
        : { error: result.code },
    ).toEqual(testCase.expect)
  })
})

describe('contract vectors: manifests', () => {
  const vectors = load('manifests.json')

  test.each(vectors.cases)('$name', (testCase) => {
    const manifest = testCase.manifestJson ? JSON.parse(testCase.manifestJson) : testCase.manifest
    const result = validateDocsManifest(manifest, testCase.options)
    const actual: Record<string, unknown> = {
      issues: issueList(result.issues, false),
      ok: result.ok,
      warnings: issueList(result.warnings, false),
    }

    if (result.ok) {
      actual.files = result.data.files.map((file) => ({
        path: file.path,
        route: file.route,
        title: file.title,
      }))
      actual.assets = result.data.assets.map((asset) => ({
        path: asset.path,
        route: asset.route ?? null,
      }))
      actual.routeCollisions = findManifestRouteCollisions({
        assets: result.data.assets,
        files: result.data.files,
      })
    }

    expect(actual).toEqual(testCase.expect)
  })
})

describe('contract vectors: signing', () => {
  const vectors = load('signing.json')

  test.each(vectors.sha256)('sha256 of $input', (testCase) => {
    expect(sha256Hex(testCase.input)).toBe(testCase.expect)
  })

  test.each(vectors.canonical)('canonical string for $path', (testCase) => {
    expect(buildCanonicalSigningString(testCase)).toBe(testCase.expect)
  })

  test.each(vectors.endpointPath)('endpoint path of $endpoint', (testCase) => {
    expect(new URL(testCase.endpoint).pathname).toBe(testCase.expect)
  })

  test.each(['privateKeyPem', 'privateKeyBase64Der', 'privateKeyOpenSsh'])(
    'signs the fixed request with %s',
    (keyField) => {
      const { request } = vectors
      const signed = signDocsSyncRequest({
        body: request.body,
        endpoint: request.endpoint,
        keyId: request.keyId,
        nonce: request.nonce,
        now: new Date(request.timestamp),
        privateKey: vectors.key[keyField],
      })

      expect(signed.headers).toEqual(request.expect.headers)
      expect(
        buildCanonicalSigningString({
          bodySha256: sha256Hex(request.body),
          method: 'POST',
          nonce: request.nonce,
          path: new URL(request.endpoint).pathname,
          timestamp: request.timestamp,
        }),
      ).toBe(request.expect.canonical)
    },
  )

  test('the expected signature verifies with the public key', () => {
    const { key, request } = vectors

    expect(
      verify(
        null,
        Buffer.from(request.expect.canonical, 'utf8'),
        createPublicKey(key.publicKeyPem),
        Buffer.from(request.expect.headers['X-VL-MD-DOCS-Signature'], 'base64'),
      ),
    ).toBe(true)
    expect(
      verify(
        null,
        Buffer.alloc(0),
        createPublicKey(key.publicKeyPem),
        Buffer.from(key.rfc8032EmptyMessageSignatureHex, 'hex'),
      ),
    ).toBe(true)
  })
})

describe('contract vectors: limits', () => {
  const vectors = load('limits.json')

  test.each(vectors.serialization)('serialization: $name', (testCase) => {
    const body = serializeSyncManifest(testCase.manifest)

    expect({
      bodyBytes: measureSyncBodyBytes(body),
      contentBytes: [...testCase.manifest.files, ...(testCase.manifest.assets ?? [])].reduce(
        (sum: number, entry: { content: string }) => sum + Buffer.byteLength(entry.content, 'utf8'),
        0,
      ),
      sha256: sha256Hex(body),
    }).toEqual(testCase.expect)
  })

  test.each(vectors.decisions)('decision for $bodyBytes / $maxBodyBytes', (testCase) => {
    expect({ tooLarge: testCase.bodyBytes > testCase.maxBodyBytes }).toEqual(testCase.expect)
  })
})

describe('contract vectors: content types', () => {
  const vectors = load('content-types.json')

  test.each(vectors.byPath)('content type for $path', (testCase) => {
    expect(getDocsAssetContentTypeForPath(testCase.path)).toBe(testCase.expect)
  })

  test.each(vectors.allowed)('allowlist check for "$contentType"', (testCase) => {
    expect(isAllowedDocsAssetContentType(testCase.contentType)).toBe(testCase.expect)
  })
})

describe('contract vectors: utf-8', () => {
  const vectors = load('utf8.json')
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })

  test.each(vectors.cases)('utf-8 validity of "$hex"', (testCase) => {
    let valid = true

    try {
      decoder.decode(Buffer.from(testCase.hex, 'hex'))
    } catch {
      valid = false
    }

    expect({ valid }).toEqual(testCase.expect)
  })
})
