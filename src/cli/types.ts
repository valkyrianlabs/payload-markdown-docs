import type { DocsDeleteBehavior } from '../sync/index.js'

export type CliCommandName =
  | 'help'
  | 'install'
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
  docsRootExplicit: boolean
  includeDocs: boolean
  includeLlms: boolean
  includeLlmsFull: boolean
  includeSkills: boolean
  llmsFullPath: string
  llmsFullPathExplicit: boolean
  llmsPath: string
  llmsPathExplicit: boolean
  maxFileBytes?: number
  maxFiles?: number
  maxTotalBytes?: number
  repository?: string
  skillsRoot: string
  skillsRootExplicit: boolean
  sourceId: string
}

export type PlanCommandOptions = {
  deleteBehavior?: DocsDeleteBehavior
  existingPath?: string
} & DocsCommandOptions

export type PushCommandOptions = {
  deleteBehavior?: DocsDeleteBehavior
  endpoint: string
  mode: 'dry-run' | 'sync'
  publish: boolean
  strictRoutes: boolean
} & (
  | {
      authMode: 'ed25519'
      keyId: string
      privateKey: string
    }
  | {
      authMode: 'github-oidc'
      oidcTokenEnv?: string
    }
) &
  DocsCommandOptions
