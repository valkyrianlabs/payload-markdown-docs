import type { DocsDeleteBehavior } from '../sync/index.js'

export type CliCommandName =
  | 'help'
  | 'keygen'
  | 'manifest'
  | 'plan'
  | 'push'
  | 'validate'

export type CliFlagValue = boolean | string

export type CliFlags = Record<string, CliFlagValue>

export type ParsedCliArgs = {
  command: CliCommandName
  flags: CliFlags
  positionals: string[]
}

export type CliParseResult =
  | {
      args: ParsedCliArgs
      ok: true
    }
  | {
      error: string
      ok: false
    }

export type CliResult = {
  exitCode: 0 | 1 | 2
  stderr?: string
  stdout?: string
}

export type DocsCommandOptions = {
  branch?: string
  commit?: string
  docsRoot: string
  maxFileBytes?: number
  maxFiles?: number
  maxTotalBytes?: number
  repository?: string
  routeBase?: string
  sourceId: string
  sourceRoot?: string
}

export type PlanCommandOptions = {
  deleteBehavior?: DocsDeleteBehavior
  existingPath?: string
} & DocsCommandOptions

export type PushCommandOptions = {
  deleteBehavior?: DocsDeleteBehavior
  endpoint: string
  keyId: string
  mode: 'dry-run' | 'sync'
  privateKey: string
  publish: boolean
} & DocsCommandOptions
