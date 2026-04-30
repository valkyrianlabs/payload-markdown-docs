import { readFile } from 'node:fs/promises'

import type { DocsDeleteBehavior } from '../../sync/index.js'
import type { HttpPostJson } from '../http.js'
import type {
  CliResult,
  ParsedCliArgs,
  PushCommandOptions,
} from '../types.js'

import { signDocsSyncRequest } from '../../security/index.js'
import {
  buildDocsManifest,
  validateDocsManifest,
} from '../../sync/index.js'
import { walkDocsFiles } from '../filesystem.js'
import { formatIssues, formatPushSummary, printJson } from '../format.js'
import { postJson } from '../http.js'
import { getFlagBoolean, getFlagString } from '../parseArgs.js'
import { getDocsCommandOptions } from './validate.js'

const supportedPushDeleteBehaviors = new Set<DocsDeleteBehavior>([
  'archive',
  'delete',
  'draft',
  'ignore',
])

type ServerPushResponse = {
  deleteBehavior?: string
  effectivePublishMode?: string
  error?: {
    code?: string
    message?: string
  }
  ok?: boolean
  publishRequested?: boolean
  summary?: {
    archive?: number
    create?: number
    delete?: number
    draft?: number
    unchanged?: number
    update?: number
    warnings?: number
  }
  syncRunId?: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isServerPushResponse = (value: unknown): value is ServerPushResponse =>
  isRecord(value)

const validateEndpointUrl = (endpoint: string): CliResult | string => {
  try {
    const parsed = new URL(endpoint)

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return {
        exitCode: 1,
        stderr: '--endpoint must be a full http:// or https:// URL.\n',
      }
    }

    return parsed.toString()
  } catch {
    return {
      exitCode: 1,
      stderr: '--endpoint must be a valid full http:// or https:// URL.\n',
    }
  }
}

const readPrivateKey = async (
  args: ParsedCliArgs,
): Promise<CliResult | string> => {
  const privateKeyFile = getFlagString(args, 'private-key-file')
  const privateKeyEnv = getFlagString(args, 'private-key-env')

  if (privateKeyFile && privateKeyEnv) {
    return {
      exitCode: 1,
      stderr:
        'Use either --private-key-file or --private-key-env, not both.\n',
    }
  }

  if (!privateKeyFile && !privateKeyEnv) {
    return {
      exitCode: 1,
      stderr: 'Push requires --private-key-file or --private-key-env.\n',
    }
  }

  if (privateKeyEnv) {
    const privateKey = process.env[privateKeyEnv]

    if (!privateKey) {
      return {
        exitCode: 1,
        stderr: `Environment variable "${privateKeyEnv}" is not set.\n`,
      }
    }

    return privateKey
  }

  try {
    return await readFile(privateKeyFile ?? '', 'utf8')
  } catch (error) {
    return {
      exitCode: 1,
      stderr:
        error instanceof Error
          ? `Could not read private key file: ${error.message}\n`
          : 'Could not read private key file.\n',
    }
  }
}

const getPushCommandOptions = async (
  args: ParsedCliArgs,
): Promise<CliResult | PushCommandOptions> => {
  const docsOptions = getDocsCommandOptions(args)

  if ('exitCode' in docsOptions) {
    return docsOptions
  }

  const endpointFlag = getFlagString(args, 'endpoint')

  if (!endpointFlag) {
    return {
      exitCode: 1,
      stderr: 'Push requires --endpoint <url>.\n',
    }
  }

  const endpoint = validateEndpointUrl(endpointFlag)

  if (typeof endpoint !== 'string') {
    return endpoint
  }

  const keyId = getFlagString(args, 'key-id')

  if (!keyId) {
    return {
      exitCode: 1,
      stderr: 'Push requires --key-id <id>.\n',
    }
  }

  if (getFlagBoolean(args, 'dry-run') && getFlagBoolean(args, 'sync')) {
    return {
      exitCode: 1,
      stderr: 'Use either --dry-run or --sync, not both.\n',
    }
  }

  const deleteBehaviorFlag = getFlagString(args, 'delete-behavior')

  if (
    deleteBehaviorFlag !== undefined &&
    !supportedPushDeleteBehaviors.has(deleteBehaviorFlag as DocsDeleteBehavior)
  ) {
    return {
      exitCode: 1,
      stderr: '--delete-behavior for push must be archive, delete, draft, or ignore.\n',
    }
  }

  const privateKey = await readPrivateKey(args)

  if (typeof privateKey !== 'string') {
    return privateKey
  }

  return {
    ...docsOptions,
    deleteBehavior: deleteBehaviorFlag as DocsDeleteBehavior | undefined,
    endpoint,
    keyId,
    mode: getFlagBoolean(args, 'sync') ? 'sync' : 'dry-run',
    privateKey,
    publish: getFlagBoolean(args, 'publish'),
  }
}

const formatServerFailure = ({
  body,
  status,
}: {
  body: unknown
  status: number
}): string => {
  if (isServerPushResponse(body) && body.error?.message) {
    return `${body.error.message}\n`
  }

  return `Sync request failed with HTTP status ${status}.\n`
}

export const runPushCommand = async (
  args: ParsedCliArgs,
  httpPost: HttpPostJson = postJson,
): Promise<CliResult> => {
  const options = await getPushCommandOptions(args)

  if ('exitCode' in options) {
    return options
  }

  const files = await walkDocsFiles({
    root: options.docsRoot,
  })
  const manifest = buildDocsManifest({
    branch: options.branch,
    commit: options.commit,
    deleteBehavior: options.deleteBehavior ?? 'archive',
    files,
    mode: options.mode,
    publish: options.publish,
    repository: options.repository,
    root: options.sourceRoot,
    sourceId: options.sourceId,
  })
  const validation = validateDocsManifest(manifest, {
    maxFileBytes: options.maxFileBytes,
    maxFiles: options.maxFiles,
    maxTotalBytes: options.maxTotalBytes,
    routeBase: options.routeBase,
  })

  if (!validation.ok) {
    return {
      exitCode: 1,
      stderr: `Manifest is invalid.\n\nErrors:\n${formatIssues(validation.issues)}\n`,
    }
  }

  const body = JSON.stringify(manifest)
  const signedRequest = signDocsSyncRequest({
    body,
    endpoint: options.endpoint,
    keyId: options.keyId,
    privateKey: options.privateKey,
  })
  const response = await httpPost({
    body: signedRequest.body,
    headers: signedRequest.headers,
    url: options.endpoint,
  })

  if (getFlagBoolean(args, 'json')) {
    return {
      exitCode:
        response.ok &&
        isServerPushResponse(response.body) &&
        response.body.ok === true
          ? 0
          : 1,
      stdout: printJson(
        {
          endpoint: options.endpoint,
          mode: options.mode,
          response: response.body,
          sourceId: options.sourceId,
          status: response.status,
        },
        getFlagBoolean(args, 'pretty'),
      ),
    }
  }

  if (
    !response.ok ||
    !isServerPushResponse(response.body) ||
    response.body.ok !== true
  ) {
    return {
      exitCode: 1,
      stderr: formatServerFailure({
        body: response.body,
        status: response.status,
      }),
    }
  }

  return {
    exitCode: 0,
    stdout: formatPushSummary({
      endpoint: options.endpoint,
      mode: options.mode,
      response: response.body,
      sourceId: options.sourceId,
    }),
  }
}
