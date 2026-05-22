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
import { collectPublishPackage } from '../filesystem.js'
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
  const positionalDocsRoot = args.positionals[0]
  const docsFlag = getFlagString(args, 'docs')
  const docsRoot = docsFlag ?? positionalDocsRoot ?? './docs'

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
    docsRootExplicit: Boolean(docsFlag ?? positionalDocsRoot),
    includeDocs: !getFlagBoolean(args, 'no-docs'),
    includeLlms: !getFlagBoolean(args, 'no-llms'),
    includeLlmsFull: !getFlagBoolean(args, 'no-llms-full'),
    includeSkills: !getFlagBoolean(args, 'no-skills'),
    llmsFullPath: getFlagString(args, 'llms-full') ?? './llms-full.txt',
    llmsFullPathExplicit: getFlagString(args, 'llms-full') !== undefined,
    llmsPath: getFlagString(args, 'llms') ?? './llms.txt',
    llmsPathExplicit: getFlagString(args, 'llms') !== undefined,
    maxFileBytes: typeof maxFileBytes === 'number' ? maxFileBytes : undefined,
    maxFiles: typeof maxFiles === 'number' ? maxFiles : undefined,
    maxTotalBytes: typeof maxTotalBytes === 'number' ? maxTotalBytes : undefined,
    repository: getFlagString(args, 'repository'),
    skillsRoot: getFlagString(args, 'skills') ?? './skills',
    skillsRootExplicit: getFlagString(args, 'skills') !== undefined,
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

  let publishPackage

  try {
    publishPackage = await collectPublishPackage(options)
  } catch (error) {
    return {
      exitCode: 1,
      stderr: error instanceof Error ? `${error.message}\n` : 'Could not read publish package.\n',
    }
  }

  const manifest = buildDocsManifest({
    assets: publishPackage.assets,
    branch: options.branch,
    commit: options.commit,
    files: publishPackage.files,
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
        fileCount: publishPackage.files.length,
        package: publishPackage.summary,
        root: options.docsRoot,
        sourceId: options.sourceId,
        validation,
      }, getFlagBoolean(args, 'pretty')),
    }
  }

  return {
    exitCode: validation.ok ? 0 : 1,
    stdout: formatValidationSummary({
      fileCount: publishPackage.files.length,
      packageSummary: publishPackage.summary,
      root: options.docsRoot,
      sourceId: options.sourceId,
      validation,
    }),
  }
}
