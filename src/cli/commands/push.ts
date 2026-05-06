import { readFile } from 'node:fs/promises'

import type { DocsDeleteBehavior } from '../../sync/index.js'
import type {
  HttpGetJson,
  HttpPostJson,
} from '../http.js'
import type {
  CliResult,
  ParsedCliArgs,
  PushCommandOptions,
} from '../types.js'

import { DEFAULT_GITHUB_OIDC_AUDIENCE } from '../../constants.js'
import { signDocsSyncRequest } from '../../security/index.js'
import {
  buildDocsManifest,
  sha256Hex,
  validateDocsManifest,
} from '../../sync/index.js'
import {
  readDocsAiExportManifest,
  walkDocsFiles,
} from '../filesystem.js'
import { formatIssues, formatPushSummary, printJson } from '../format.js'
import {
  getJson,
  postJson,
} from '../http.js'
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

const getGithubOidcTokenRequestUrl = ({
  audience,
  requestUrl,
}: {
  audience: string
  requestUrl: string
}): CliResult | string => {
  try {
    const url = new URL(requestUrl)
    url.searchParams.set('audience', audience)

    return url.toString()
  } catch {
    return {
      exitCode: 1,
      stderr: 'ACTIONS_ID_TOKEN_REQUEST_URL is not a valid URL.\n',
    }
  }
}

const readGithubOidcToken = async ({
  args,
  audience,
  httpGet,
}: {
  args: ParsedCliArgs
  audience: string
  httpGet: HttpGetJson
}): Promise<CliResult | string> => {
  const tokenEnv = getFlagString(args, 'oidc-token-env')

  if (tokenEnv) {
    const token = process.env[tokenEnv]

    if (!token) {
      return {
        exitCode: 1,
        stderr: `Environment variable "${tokenEnv}" is not set.\n`,
      }
    }

    return token
  }

  const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL
  const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN

  if (!requestUrl || !requestToken) {
    return {
      exitCode: 1,
      stderr:
        'GitHub OIDC push requires ACTIONS_ID_TOKEN_REQUEST_URL and ACTIONS_ID_TOKEN_REQUEST_TOKEN, or --oidc-token-env.\n',
    }
  }

  const url = getGithubOidcTokenRequestUrl({
    audience,
    requestUrl,
  })

  if (typeof url !== 'string') {
    return url
  }

  const response = await httpGet({
    headers: {
      Authorization: `bearer ${requestToken}`,
    },
    url,
  })

  if (!response.ok || !isRecord(response.body) || typeof response.body.value !== 'string') {
    return {
      exitCode: 1,
      stderr: `Could not retrieve GitHub OIDC token. HTTP status ${response.status}.\n`,
    }
  }

  return response.body.value
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

  const mode: PushCommandOptions['mode'] = getFlagBoolean(args, 'sync')
    ? 'sync'
    : 'dry-run'
  const baseOptions = {
    ...docsOptions,
    deleteBehavior: deleteBehaviorFlag as DocsDeleteBehavior | undefined,
    endpoint,
    mode,
    publish: getFlagBoolean(args, 'publish'),
  }

  if (getFlagBoolean(args, 'github-oidc')) {
    if (getFlagString(args, 'key-id')) {
      return {
        exitCode: 1,
        stderr: 'Do not use --key-id with --github-oidc.\n',
      }
    }

    if (getFlagString(args, 'private-key-file') || getFlagString(args, 'private-key-env')) {
      return {
        exitCode: 1,
        stderr: 'Do not use Ed25519 private key flags with --github-oidc.\n',
      }
    }

    return {
      ...baseOptions,
      authMode: 'github-oidc',
      oidcAudience:
        getFlagString(args, 'oidc-audience') ?? DEFAULT_GITHUB_OIDC_AUDIENCE,
      oidcTokenEnv: getFlagString(args, 'oidc-token-env'),
    }
  }

  const keyId = getFlagString(args, 'key-id')

  if (!keyId) {
    return {
      exitCode: 1,
      stderr: 'Push requires --key-id <id>.\n',
    }
  }

  const privateKey = await readPrivateKey(args)

  if (typeof privateKey !== 'string') {
    return privateKey
  }

  return {
    ...baseOptions,
    authMode: 'ed25519',
    keyId,
    privateKey,
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
  httpGet: HttpGetJson = getJson,
): Promise<CliResult> => {
  const options = await getPushCommandOptions(args)

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
  let signedRequest:
    | {
        body: string
        headers: Record<string, string>
      }
    | ReturnType<typeof signDocsSyncRequest>

  if (options.authMode === 'github-oidc') {
    const oidcToken = await readGithubOidcToken({
      args,
      audience: options.oidcAudience,
      httpGet,
    })

    if (typeof oidcToken !== 'string') {
      return oidcToken
    }

    signedRequest = {
      body,
      headers: {
        Authorization: `Bearer ${oidcToken}`,
        'Content-Type': 'application/json',
        'X-VL-MD-DOCS-Body-SHA256': sha256Hex(body),
      },
    }
  } else {
    signedRequest = signDocsSyncRequest({
      body,
      endpoint: options.endpoint,
      keyId: options.keyId,
      privateKey: options.privateKey,
    })
  }

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
