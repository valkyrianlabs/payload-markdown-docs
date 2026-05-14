import type {
  CliCommandName,
  CliFlagValue,
  CliParseResult,
  CliResult,
  ParsedCliArgs,
} from './types.js'

const commands = new Set<CliCommandName>([
  'help',
  'install',
  'keygen',
  'manifest',
  'plan',
  'push',
  'validate',
])

const docsValueFlags = new Set([
  'branch',
  'commit',
  'docs',
  'llms',
  'llms-full',
  'max-file-bytes',
  'max-files',
  'max-total-bytes',
  'repository',
  'skills',
  'source',
])

const docsBooleanFlags = new Set([
  'help',
  'json',
  'no-docs',
  'no-llms',
  'no-llms-full',
  'no-skills',
  'pretty',
])
const planValueFlags = new Set(['delete-behavior', 'existing', ...docsValueFlags])
const pushValueFlags = new Set([
  'delete-behavior',
  'endpoint',
  'key-id',
  'oidc-token-env',
  'private-key-env',
  'private-key-file',
  ...docsValueFlags,
])
const pushBooleanFlags = new Set([
  'dry-run',
  'github-oidc',
  'help',
  'json',
  'no-docs',
  'no-llms',
  'no-llms-full',
  'no-skills',
  'pretty',
  'publish',
  'sync',
])
const installValueFlags = new Set([
  'agent',
  'docs-root',
  'out',
  'package-manager',
])
const installBooleanFlags = new Set(['claude', 'codex', 'dry-run', 'force', 'help'])
const keygenValueFlags = new Set(['format', 'out'])
const keygenBooleanFlags = new Set(['force', 'help'])

const knownCommand = (command: string): command is CliCommandName =>
  commands.has(command as CliCommandName)

const normalizeFlagName = (input: string): string => input.slice(2)

const allowedFlagsForCommand = (
  command: CliCommandName,
): {
  boolean: Set<string>
  value: Set<string>
} => {
  if (command === 'keygen') {
    return {
      boolean: keygenBooleanFlags,
      value: keygenValueFlags,
    }
  }

  if (command === 'install') {
    return {
      boolean: installBooleanFlags,
      value: installValueFlags,
    }
  }

  if (command === 'plan') {
    return {
      boolean: docsBooleanFlags,
      value: planValueFlags,
    }
  }

  if (command === 'push') {
    return {
      boolean: pushBooleanFlags,
      value: pushValueFlags,
    }
  }

  if (command === 'manifest' || command === 'validate') {
    return {
      boolean: docsBooleanFlags,
      value: docsValueFlags,
    }
  }

  return {
    boolean: new Set(['help']),
    value: new Set(),
  }
}

export const parseCliArgs = (argv: string[]): CliParseResult => {
  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
    return {
      args: {
        command: 'help',
        flags: {
          help: true,
        },
        positionals: [],
      },
      ok: true,
    }
  }

  const [rawCommand, ...rest] = argv

  if (!rawCommand || rawCommand.startsWith('-')) {
    return {
      error: 'Missing command. Run payload-markdown-docs --help.',
      ok: false,
    }
  }

  if (!knownCommand(rawCommand)) {
    return {
      error: `Unknown command "${rawCommand}". Run payload-markdown-docs --help.`,
      ok: false,
    }
  }

  if (rawCommand === 'help') {
    const [topic] = rest

    if (topic && !knownCommand(topic)) {
      return {
        error: `Unknown help topic "${topic}".`,
        ok: false,
      }
    }

    return {
      args: {
        command: 'help',
        flags: topic ? { topic } : {},
        positionals: topic ? [topic] : [],
      },
      ok: true,
    }
  }

  const allowedFlags = allowedFlagsForCommand(rawCommand)
  const flags: Record<string, CliFlagValue> = {}
  const positionals: string[] = []

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index]

    if (!token) {
      continue
    }

    if (!token.startsWith('--')) {
      positionals.push(token)
      continue
    }

    const flagName = normalizeFlagName(token)

    if (allowedFlags.boolean.has(flagName)) {
      flags[flagName] = true
      continue
    }

    if (!allowedFlags.value.has(flagName)) {
      return {
        error: `Unknown flag "--${flagName}" for ${rawCommand}.`,
        ok: false,
      }
    }

    const value = rest[index + 1]

    if (!value || value.startsWith('--')) {
      return {
        error: `Flag "--${flagName}" requires a value.`,
        ok: false,
      }
    }

    flags[flagName] = value
    index += 1
  }

  return {
    args: {
      command: rawCommand,
      flags,
      positionals,
    },
    ok: true,
  }
}

export const getFlagString = (
  args: ParsedCliArgs,
  name: string,
): string | undefined => {
  const value = args.flags[name]

  return typeof value === 'string' ? value : undefined
}

export const getFlagBoolean = (args: ParsedCliArgs, name: string): boolean =>
  args.flags[name] === true

export const parseIntegerFlag = (
  args: ParsedCliArgs,
  name: string,
): CliResult | number | undefined => {
  const value = getFlagString(args, name)

  if (value === undefined) {
    return undefined
  }

  const parsed = Number(value)

  if (!Number.isInteger(parsed) || parsed < 0) {
    return {
      exitCode: 1,
      stderr: `Flag "--${name}" must be a non-negative integer.\n`,
    }
  }

  return parsed
}
