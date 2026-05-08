import type { CliResult, ParsedCliArgs } from '../types.js'

import {
  buildDocsManifest,
  validateDocsManifest,
} from '../../sync/index.js'
import {
  readDocsAiExportManifest,
  walkDocsFiles,
} from '../filesystem.js'
import { formatIssues, printJson } from '../format.js'
import { getFlagBoolean } from '../parseArgs.js'
import { getDocsCommandOptions } from './validate.js'

export const runManifestCommand = async (
  args: ParsedCliArgs,
): Promise<CliResult> => {
  const options = getDocsCommandOptions(args)

  if ('exitCode' in options) {
    return options
  }

  const files = await walkDocsFiles({
    root: options.docsRoot,
  })
  const aiExport = await readDocsAiExportManifest({
    root: options.docsRoot,
  })

  if (!aiExport.ok) {
    return {
      exitCode: 1,
      stderr: `AI export manifest is invalid.\n\nErrors:\n${formatIssues(aiExport.issues)}\n`,
    }
  }

  const manifest = buildDocsManifest({
    aiExport: aiExport.manifest,
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

  if (!validation.ok) {
    return {
      exitCode: 1,
      stderr: `Manifest is invalid.\n\nErrors:\n${formatIssues(validation.issues)}\n`,
    }
  }

  return {
    exitCode: 0,
    stdout: printJson(manifest, getFlagBoolean(args, 'pretty')),
  }
}
