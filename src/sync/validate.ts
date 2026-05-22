import type {
  DocsDeleteBehavior,
  DocsManifest,
  DocsManifestAssetKind,
  DocsManifestFile,
  DocsManifestSource,
  DocsSyncMode,
  ValidatedDocsManifest,
  ValidatedDocsManifestAsset,
  ValidatedDocsManifestFile,
} from './manifest.js'

import {
  DEFAULT_DOCS_ROUTE_BASE,
  DEFAULT_MAX_DOCS_FILE_BYTES,
  DEFAULT_MAX_DOCS_FILES,
  DEFAULT_MAX_DOCS_TOTAL_BYTES,
} from '../constants.js'
import {
  parseDocsFrontmatter,
  resolveDocsTitle,
} from './frontmatter.js'
import { sha256Hex } from './hash.js'
import {
  deriveAssetRouteFromSourcePath,
  deriveRouteFromSourcePath,
  normalizeAssetPath,
  normalizeDocsPath,
} from './paths.js'

export type DocsValidationErrorCode =
  | 'asset_too_large'
  | 'duplicate_asset_path'
  | 'duplicate_existing_path'
  | 'duplicate_path'
  | 'empty_manifest'
  | 'file_too_large'
  | 'invalid_asset'
  | 'invalid_delete_behavior'
  | 'invalid_frontmatter'
  | 'invalid_hash'
  | 'invalid_manifest'
  | 'invalid_mode'
  | 'invalid_path'
  | 'invalid_source'
  | 'invalid_version'
  | 'manifest_too_large'
  | 'non_markdown_file'
  | 'path_traversal'
  | 'too_many_assets'
  | 'too_many_files'

export type DocsValidationIssue = {
  code: DocsValidationErrorCode
  message: string
  path?: string
}

export type DocsValidationResult<T = unknown> =
  | {
      data: T
      issues: DocsValidationIssue[]
      ok: true
      warnings: DocsValidationIssue[]
    }
  | {
      issues: DocsValidationIssue[]
      ok: false
      warnings: DocsValidationIssue[]
    }

export type DocsValidationOptions = {
  allowedSourceIds?: string[]
  assetRouteBase?: string
  maxAssets?: number
  maxFileBytes?: number
  maxFiles?: number
  maxTotalBytes?: number
  routeBase?: string
}

const syncModes = new Set<DocsSyncMode>(['dry-run', 'sync'])
const assetKinds = new Set<DocsManifestAssetKind>(['llms', 'llms-full', 'skill', 'static'])
const deleteBehaviors = new Set<DocsDeleteBehavior>([
  'archive',
  'delete',
  'draft',
  'ignore',
])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const createIssue = ({
  code,
  message,
  path,
}: DocsValidationIssue): DocsValidationIssue => ({
  code,
  message,
  path,
})

const byteLength = (content: string): number => Buffer.byteLength(content, 'utf8')

const validateSource = ({
  allowedSourceIds,
  source,
}: {
  allowedSourceIds?: string[]
  source: unknown
}): {
  issues: DocsValidationIssue[]
  source?: DocsManifestSource
} => {
  if (!isRecord(source) || typeof source.id !== 'string' || source.id.trim() === '') {
    return {
      issues: [
        createIssue({
          code: 'invalid_source',
          message: 'Manifest source.id is required.',
        }),
      ],
    }
  }

  if (allowedSourceIds && !allowedSourceIds.includes(source.id)) {
    return {
      issues: [
        createIssue({
          code: 'invalid_source',
          message: `Manifest source.id "${source.id}" is not allowed.`,
        }),
      ],
    }
  }

  return {
    issues: [],
    source: {
      id: source.id,
      branch: typeof source.branch === 'string' ? source.branch : undefined,
      commit: typeof source.commit === 'string' ? source.commit : undefined,
      repository: typeof source.repository === 'string' ? source.repository : undefined,
    },
  }
}

const validateMode = (mode: unknown): {
  issues: DocsValidationIssue[]
  mode: DocsSyncMode
} => {
  if (mode === undefined) {
    return {
      issues: [],
      mode: 'dry-run',
    }
  }

  if (syncModes.has(mode as DocsSyncMode)) {
    return {
      issues: [],
      mode: mode as DocsSyncMode,
    }
  }

  return {
    issues: [
      createIssue({
        code: 'invalid_mode',
        message: 'Manifest mode must be "dry-run" or "sync".',
      }),
    ],
    mode: 'dry-run',
  }
}

const validateDeleteBehavior = (deleteBehavior: unknown): {
  deleteBehavior: DocsDeleteBehavior
  issues: DocsValidationIssue[]
} => {
  if (deleteBehavior === undefined) {
    return {
      deleteBehavior: 'archive',
      issues: [],
    }
  }

  if (deleteBehaviors.has(deleteBehavior as DocsDeleteBehavior)) {
    return {
      deleteBehavior: deleteBehavior as DocsDeleteBehavior,
      issues: [],
    }
  }

  return {
    deleteBehavior: 'archive',
    issues: [
      createIssue({
        code: 'invalid_delete_behavior',
        message: 'Manifest deleteBehavior must be archive, delete, draft, or ignore.',
      }),
    ],
  }
}

const validateManifestFile = ({
  file,
  maxFileBytes,
  routeBase,
}: {
  file: unknown
  maxFileBytes: number
  routeBase: string
}): {
  fileBytes: number
  issues: DocsValidationIssue[]
  normalizedPath?: string
  validatedFile?: ValidatedDocsManifestFile
  warnings: DocsValidationIssue[]
} => {
  const issues: DocsValidationIssue[] = []
  const warnings: DocsValidationIssue[] = []

  if (!isRecord(file)) {
    return {
      fileBytes: 0,
      issues: [
        createIssue({
          code: 'invalid_manifest',
          message: 'Manifest file entries must be objects.',
        }),
      ],
      warnings,
    }
  }

  const path = typeof file.path === 'string' ? file.path : undefined
  const content = typeof file.content === 'string' ? file.content : undefined

  if (!path || content === undefined) {
    return {
      fileBytes: 0,
      issues: [
        createIssue({
          code: 'invalid_manifest',
          message: 'Manifest file entries require string path and content.',
          path,
        }),
      ],
      warnings,
    }
  }

  const normalizedPath = normalizeDocsPath(path)

  if (!normalizedPath.ok) {
    return {
      fileBytes: 0,
      issues: [
        createIssue({
          code: normalizedPath.code,
          message: normalizedPath.message,
          path,
        }),
      ],
      warnings,
    }
  }

  const fileBytes = byteLength(content)

  if (fileBytes > maxFileBytes) {
    issues.push(
      createIssue({
        code: 'file_too_large',
        message: `File exceeds maximum size of ${maxFileBytes} bytes.`,
        path: normalizedPath.path,
      }),
    )
  }

  const computedHash = sha256Hex(content)

  if (
    file.sha256 !== undefined &&
    (typeof file.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/i.test(file.sha256) ||
      file.sha256.toLowerCase() !== computedHash)
  ) {
    issues.push(
      createIssue({
        code: 'invalid_hash',
        message: 'Manifest file sha256 does not match content.',
        path: normalizedPath.path,
      }),
    )
  }

  const parsedFrontmatter = parseDocsFrontmatter(content, {
    path: normalizedPath.path,
  })

  issues.push(...parsedFrontmatter.issues)
  warnings.push(...parsedFrontmatter.warnings)

  const route = deriveRouteFromSourcePath({
    slug: parsedFrontmatter.frontmatter.slug,
    routeBase,
    sourcePath: normalizedPath.path,
  })

  return {
    fileBytes,
    issues,
    normalizedPath: normalizedPath.path,
    validatedFile: {
      content: parsedFrontmatter.content,
      frontmatter: parsedFrontmatter.frontmatter,
      path: normalizedPath.path,
      route,
      sha256: computedHash,
      title: resolveDocsTitle({
        content: parsedFrontmatter.content,
        frontmatter: parsedFrontmatter.frontmatter,
        sourcePath: normalizedPath.path,
      }),
    },
    warnings,
  }
}

const validateManifestAsset = ({
  asset,
  assetRouteBase,
  maxFileBytes,
  sourceId,
}: {
  asset: unknown
  assetRouteBase: string
  maxFileBytes: number
  sourceId?: string
}): {
  assetBytes: number
  issues: DocsValidationIssue[]
  normalizedPath?: string
  validatedAsset?: ValidatedDocsManifestAsset
  warnings: DocsValidationIssue[]
} => {
  const issues: DocsValidationIssue[] = []
  const warnings: DocsValidationIssue[] = []

  if (!isRecord(asset)) {
    return {
      assetBytes: 0,
      issues: [
        createIssue({
          code: 'invalid_asset',
          message: 'Manifest asset entries must be objects.',
        }),
      ],
      warnings,
    }
  }

  const path = typeof asset.path === 'string' ? asset.path : undefined
  const content = typeof asset.content === 'string' ? asset.content : undefined
  const contentType =
    typeof asset.contentType === 'string' && asset.contentType.trim() !== ''
      ? asset.contentType.trim()
      : undefined
  const kind = asset.kind as DocsManifestAssetKind | undefined
  const route =
    typeof asset.route === 'string' && asset.route.trim() !== '' ? asset.route : undefined

  if (!path || content === undefined || !contentType || !kind) {
    return {
      assetBytes: 0,
      issues: [
        createIssue({
          code: 'invalid_asset',
          message: 'Manifest asset entries require string path, content, contentType, and kind.',
          path,
        }),
      ],
      warnings,
    }
  }

  if (!assetKinds.has(kind)) {
    return {
      assetBytes: 0,
      issues: [
        createIssue({
          code: 'invalid_asset',
          message: 'Manifest asset kind must be llms, llms-full, skill, or static.',
          path,
        }),
      ],
      warnings,
    }
  }

  const normalizedPath = normalizeAssetPath(path)

  if (!normalizedPath.ok) {
    return {
      assetBytes: 0,
      issues: [
        createIssue({
          code: normalizedPath.code,
          message: normalizedPath.message,
          path,
        }),
      ],
      warnings,
    }
  }

  const assetBytes = byteLength(content)

  if (assetBytes > maxFileBytes) {
    issues.push(
      createIssue({
        code: 'asset_too_large',
        message: `Asset exceeds maximum size of ${maxFileBytes} bytes.`,
        path: normalizedPath.path,
      }),
    )
  }

  const computedHash = sha256Hex(content)

  if (
    asset.sha256 !== undefined &&
    (typeof asset.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/i.test(asset.sha256) ||
      asset.sha256.toLowerCase() !== computedHash)
  ) {
    issues.push(
      createIssue({
        code: 'invalid_hash',
        message: 'Manifest asset sha256 does not match content.',
        path: normalizedPath.path,
      }),
    )
  }

  return {
    assetBytes,
    issues,
    normalizedPath: normalizedPath.path,
    validatedAsset: {
      content,
      contentType,
      kind,
      path: normalizedPath.path,
      route: deriveAssetRouteFromSourcePath({
        kind,
        route,
        routeBase: assetRouteBase,
        sourceId,
        sourcePath: normalizedPath.path,
      }),
      sha256: computedHash,
    },
    warnings,
  }
}

export const validateDocsManifest = (
  manifest: unknown,
  options: DocsValidationOptions = {},
): DocsValidationResult<ValidatedDocsManifest> => {
  const issues: DocsValidationIssue[] = []
  const warnings: DocsValidationIssue[] = []
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_DOCS_FILE_BYTES
  const maxAssets = options.maxAssets ?? DEFAULT_MAX_DOCS_FILES
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_DOCS_FILES
  const maxTotalBytes = options.maxTotalBytes ?? DEFAULT_MAX_DOCS_TOTAL_BYTES
  const routeBase = options.routeBase ?? DEFAULT_DOCS_ROUTE_BASE
  const assetRouteBase = options.assetRouteBase ?? routeBase

  if (!isRecord(manifest)) {
    return {
      issues: [
        createIssue({
          code: 'invalid_manifest',
          message: 'Manifest must be an object.',
        }),
      ],
      ok: false,
      warnings,
    }
  }

  if (manifest.version !== 1) {
    issues.push(
      createIssue({
        code: 'invalid_version',
        message: 'Manifest version must be 1.',
      }),
    )
  }

  const sourceValidation = validateSource({
    allowedSourceIds: options.allowedSourceIds,
    source: manifest.source,
  })

  issues.push(...sourceValidation.issues)

  const modeValidation = validateMode(manifest.mode)
  issues.push(...modeValidation.issues)

  const deleteBehaviorValidation = validateDeleteBehavior(manifest.deleteBehavior)
  issues.push(...deleteBehaviorValidation.issues)

  const publish =
    manifest.publish === undefined ? false : manifest.publish === true

  if (manifest.publish !== undefined && typeof manifest.publish !== 'boolean') {
    issues.push(
      createIssue({
        code: 'invalid_manifest',
        message: 'Manifest publish must be a boolean.',
      }),
    )
  }

  const files = Array.isArray(manifest.files) ? manifest.files : undefined
  const assets =
    manifest.assets === undefined
      ? []
      : Array.isArray(manifest.assets)
        ? manifest.assets
        : undefined

  if (!files) {
    issues.push(
      createIssue({
        code: 'invalid_manifest',
        message: 'Manifest files must be an array.',
      }),
    )
  }

  if (!assets) {
    issues.push(
      createIssue({
        code: 'invalid_manifest',
        message: 'Manifest assets must be an array when provided.',
      }),
    )
  }

  if ((files?.length ?? 0) === 0 && (assets?.length ?? 0) === 0) {
    issues.push(
      createIssue({
        code: 'empty_manifest',
        message: 'Manifest must include at least one docs file or asset.',
      }),
    )
  }

  if (files && files.length > maxFiles) {
    issues.push(
      createIssue({
        code: 'too_many_files',
        message: `Manifest exceeds maximum file count of ${maxFiles}.`,
      }),
    )
  }

  if (assets && assets.length > maxAssets) {
    issues.push(
      createIssue({
        code: 'too_many_assets',
        message: `Manifest exceeds maximum asset count of ${maxAssets}.`,
      }),
    )
  }

  const validatedFiles: ValidatedDocsManifestFile[] = []
  const validatedAssets: ValidatedDocsManifestAsset[] = []
  const normalizedPaths = new Set<string>()
  const normalizedAssetPaths = new Set<string>()
  let totalBytes = 0

  for (const file of files ?? []) {
    const fileValidation = validateManifestFile({
      file,
      maxFileBytes,
      routeBase,
    })

    totalBytes += fileValidation.fileBytes
    issues.push(...fileValidation.issues)
    warnings.push(...fileValidation.warnings)

    if (fileValidation.normalizedPath) {
      if (normalizedPaths.has(fileValidation.normalizedPath)) {
        issues.push(
          createIssue({
            code: 'duplicate_path',
            message: 'Manifest contains duplicate normalized paths.',
            path: fileValidation.normalizedPath,
          }),
        )
      }

      normalizedPaths.add(fileValidation.normalizedPath)
    }

    if (fileValidation.validatedFile) {
      validatedFiles.push(fileValidation.validatedFile)
    }
  }

  for (const asset of assets ?? []) {
    const assetValidation = validateManifestAsset({
      asset,
      assetRouteBase,
      maxFileBytes,
      sourceId: sourceValidation.source?.id,
    })

    totalBytes += assetValidation.assetBytes
    issues.push(...assetValidation.issues)
    warnings.push(...assetValidation.warnings)

    if (assetValidation.normalizedPath) {
      if (normalizedAssetPaths.has(assetValidation.normalizedPath)) {
        issues.push(
          createIssue({
            code: 'duplicate_asset_path',
            message: 'Manifest contains duplicate normalized asset paths.',
            path: assetValidation.normalizedPath,
          }),
        )
      }

      normalizedAssetPaths.add(assetValidation.normalizedPath)
    }

    if (assetValidation.validatedAsset) {
      validatedAssets.push(assetValidation.validatedAsset)
    }
  }

  if (totalBytes > maxTotalBytes) {
    issues.push(
      createIssue({
        code: 'manifest_too_large',
        message: `Manifest content exceeds maximum total size of ${maxTotalBytes} bytes.`,
      }),
    )
  }

  if (issues.length > 0 || !sourceValidation.source) {
    return {
      issues,
      ok: false,
      warnings,
    }
  }

  return {
    data: {
      assets: validatedAssets,
      deleteBehavior: deleteBehaviorValidation.deleteBehavior,
      files: validatedFiles,
      mode: modeValidation.mode,
      publish,
      source: sourceValidation.source,
      version: 1,
    },
    issues,
    ok: true,
    warnings,
  }
}

export type { DocsManifest, DocsManifestFile, DocsManifestSource }
