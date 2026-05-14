import path from 'node:path'

import type {
  CliResult,
  DocsCommandOptions,
  ParsedCliArgs,
} from '../types.js'

import {
  buildDocsManifest,
  validateDocsManifest,
} from '../../sync/index.js'
import { walkDocsFiles } from '../filesystem.js'
import { formatValidationSummary, printJson } from '../format.js'
import {
  getFlagBoolean,
  getFlagString,
  parseIntegerFlag,
} from '../parseArgs.js'

const getRepositoryName = (repository: string | undefined): string | undefined => {
  if (!repository) {
    return undefined
  }

  const [, name] = repository.split('/', 2)

  return name ?? repository
}

const getDefaultSourceId = (docsRoot: string): string =>
  getRepositoryName(process.env.GITHUB_REPOSITORY) ??
  (path.basename(path.resolve(docsRoot)) === 'docs'
    ? 'local-docs'
    : path.basename(path.resolve(docsRoot)))

export const getDocsCommandOptions = (
  args: ParsedCliArgs,
): CliResult | DocsCommandOptions => {
  const docsRoot = args.positionals[0]

  if (!docsRoot) {
    return {
      exitCode: 1,
      stderr: `Command "${args.command}" requires a docs root path.\n`,
    }
  }

  const maxFiles = parseIntegerFlag(args, 'max-files')
  const maxFileBytes = parseIntegerFlag(args, 'max-file-bytes')
  const maxTotalBytes = parseIntegerFlag(args, 'max-total-bytes')

  for (const parsed of [maxFiles, maxFileBytes, maxTotalBytes]) {
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed
    }
  }

  return {
    branch: getFlagString(args, 'branch'),
    commit: getFlagString(args, 'commit'),
    docsRoot,
    maxFileBytes: typeof maxFileBytes === 'number' ? maxFileBytes : undefined,
    maxFiles: typeof maxFiles === 'number' ? maxFiles : undefined,
    maxTotalBytes: typeof maxTotalBytes === 'number' ? maxTotalBytes : undefined,
    repository: getFlagString(args, 'repository'),
    sourceId: getFlagString(args, 'source') ?? getDefaultSourceId(docsRoot),
  }
}

export const runValidateCommand = async (
  args: ParsedCliArgs,
): Promise<CliResult> => {
  const options = getDocsCommandOptions(args)

  if ('exitCode' in options) {
    return options
  }

  const files = await walkDocsFiles({
    root: options.docsRoot,
  })

  const manifest = buildDocsManifest({
    branch: options.branch,
    commit: options.commit,
    files,
    repository: options.repository,
    sourceId: options.sourceId,
  })
  const validation = validateDocsManifest(manifest, {
    maxFileBytes: options.maxFileBytes,
    maxFiles: options.maxFiles,
    maxTotalBytes: options.maxTotalBytes,
    routeBase: `/${options.sourceId}`,
  })

  if (getFlagBoolean(args, 'json')) {
    return {
      exitCode: validation.ok ? 0 : 1,
      stdout: printJson({
        fileCount: files.length,
        root: options.docsRoot,
        sourceId: options.sourceId,
        validation,
      }, getFlagBoolean(args, 'pretty')),
    }
  }

  return {
    exitCode: validation.ok ? 0 : 1,
    stdout: formatValidationSummary({
      fileCount: files.length,
      root: options.docsRoot,
      sourceId: options.sourceId,
      validation,
    }),
  }
}
