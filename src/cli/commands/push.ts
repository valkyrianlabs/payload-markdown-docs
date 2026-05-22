import { readFile } from 'node:fs/promises'

import type { DocsDeleteBehavior } from '../../sync/index.js'
import type { HttpGetJson, HttpPostJson } from '../http.js'
import type { CliResult, ParsedCliArgs, PushCommandOptions } from '../types.js'

import { DocsSyncKeyError, signDocsSyncRequest } from '../../security/index.js'
import { buildDocsManifest, sha256Hex, validateDocsManifest } from '../../sync/index.js'
import { findPayloadAppDirWithAssetRoutes } from '../assetRoutes.js'
import { collectPublishPackage } from '../filesystem.js'
import { formatIssues, formatPushSummary, printJson } from '../format.js'
import { getJson, postJson } from '../http.js'
import { getFlagBoolean, getFlagString } from '../parseArgs.js'
import { getDocsCommandOptions } from './validate.js'

const supportedPushDeleteBehaviors = new Set<DocsDeleteBehavior>([
  'archive',
  'delete',
  'draft',
  'ignore',
])

const missingAssetRoutesWarning =
  'Assets were included in the manifest, but public asset route files were not found.\n' +
  'Run:\n' +
  'payload-markdown-docs install routes --payload-app "src/app/(payload)"\n' +
  'Without these route files, public /llms.txt and /skills routes will 404 outside /api.\n'

type ServerPushResponse = {
  deleteBehavior?: string
  error?: {
    code?: string
    message?: string
  }
  errors?: Array<{
    message?: string
  }>
  ok?: boolean
  publishRequested?: boolean
  summary?: {
    archive?: number
    assetArchive?: number
    assetCreate?: number
    assetDelete?: number
    assetUnchanged?: number
    assetUpdate?: number
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

const isServerPushResponse = (value: unknown): value is ServerPushResponse => isRecord(value)

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

const readPrivateKey = async (args: ParsedCliArgs): Promise<CliResult | string> => {
  const privateKeyFile = getFlagString(args, 'private-key-file')
  const privateKeyEnv = getFlagString(args, 'private-key-env')

  if (privateKeyFile && privateKeyEnv) {
    return {
      exitCode: 1,
      stderr: 'Use either --private-key-file or --private-key-env, not both.\n',
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

  const mode: PushCommandOptions['mode'] = getFlagBoolean(args, 'dry-run') ? 'dry-run' : 'sync'
  const baseOptions = {
    ...docsOptions,
    deleteBehavior: deleteBehaviorFlag as DocsDeleteBehavior | undefined,
    endpoint,
    mode,
    publish: getFlagBoolean(args, 'publish'),
    strictRoutes: getFlagBoolean(args, 'strict-routes'),
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

const trimResponseText = (text: string): string => {
  const trimmed = text.trim()

  if (trimmed.length <= 1000) {
    return trimmed
  }

  return `${trimmed.slice(0, 1000)}...`
}

const formatServerFailure = ({
  body,
  status,
  text,
}: {
  body: unknown
  status: number
  text?: string
}): string => {
  if (isServerPushResponse(body) && body.error?.message) {
    return `${body.error.message}\n`
  }

  if (isServerPushResponse(body) && body.errors?.some((error) => error.message)) {
    return `Sync request failed with HTTP status ${status}.\n\n${body.errors
      .flatMap((error) => (error.message ? [`- ${error.message}`] : []))
      .join('\n')}\n`
  }

  const responseText = text ? trimResponseText(text) : ''

  if (responseText) {
    return `Sync request failed with HTTP status ${status}.\n\nResponse body:\n${responseText}\n`
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
    deleteBehavior: options.deleteBehavior ?? 'archive',
    files: publishPackage.files,
    mode: options.mode,
    publish: options.publish,
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

  let routeWarning = ''

  if (manifest.assets && manifest.assets.length > 0) {
    const routeAppDir = await findPayloadAppDirWithAssetRoutes()

    if (!routeAppDir) {
      if (options.strictRoutes) {
        return {
          exitCode: 1,
          stderr: missingAssetRoutesWarning,
        }
      }

      routeWarning = missingAssetRoutesWarning
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
      audience: options.sourceId,
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
    try {
      signedRequest = signDocsSyncRequest({
        body,
        endpoint: options.endpoint,
        keyId: options.keyId,
        privateKey: options.privateKey,
      })
    } catch (error) {
      if (error instanceof DocsSyncKeyError) {
        return {
          exitCode: 1,
          stderr: `${error.message}\n`,
        }
      }

      throw error
    }
  }

  const response = await httpPost({
    body: signedRequest.body,
    headers: signedRequest.headers,
    url: options.endpoint,
  })

  if (getFlagBoolean(args, 'json')) {
    return {
      exitCode:
        response.ok && isServerPushResponse(response.body) && response.body.ok === true ? 0 : 1,
      stderr: routeWarning || undefined,
      stdout: printJson(
        {
          endpoint: options.endpoint,
          mode: options.mode,
          package: publishPackage.summary,
          response: response.body,
          sourceId: options.sourceId,
          status: response.status,
        },
        getFlagBoolean(args, 'pretty'),
      ),
    }
  }

  if (!response.ok || !isServerPushResponse(response.body) || response.body.ok !== true) {
    return {
      exitCode: 1,
      stderr: `${routeWarning}${formatServerFailure({
        body: response.body,
        status: response.status,
        text: response.text,
      })}`,
    }
  }

  return {
    exitCode: 0,
    stderr: routeWarning || undefined,
    stdout: formatPushSummary({
      endpoint: options.endpoint,
      mode: options.mode,
      response: response.body,
      sourceId: options.sourceId,
    }),
  }
}
