import type { CliResult, ParsedCliArgs } from '../types.js'

import {
  buildDocsManifest,
  validateDocsManifest,
} from '../../sync/index.js'
import { walkDocsFiles } from '../filesystem.js'
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
