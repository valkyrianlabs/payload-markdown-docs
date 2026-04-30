#!/usr/bin/env node

import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { CliCommandName, CliResult, ParsedCliArgs } from './types.js'

import { runKeygenCommand } from './commands/keygen.js'
import { runManifestCommand } from './commands/manifest.js'
import { runPlanCommand } from './commands/plan.js'
import { runPushCommand } from './commands/push.js'
import { runValidateCommand } from './commands/validate.js'
import { getFlagString, parseCliArgs } from './parseArgs.js'

const helpText = `payload-markdown-docs

Usage:
  payload-markdown-docs validate <docs-root> [options]
  payload-markdown-docs manifest <docs-root> [options]
  payload-markdown-docs plan <docs-root> [options]
  payload-markdown-docs push <docs-root> [options]
  payload-markdown-docs keygen [options]

Commands:
  validate   Validate a local Markdown docs directory.
  manifest   Print a JSON docs manifest for a local Markdown docs directory.
  plan       Build a dry sync plan against optional existing docs records.
  push       Sign and upload a docs manifest to a Payload sync endpoint.
  keygen     Generate Ed25519 keys for a future signed sync workflow.
`

const commandHelp: Record<Exclude<CliCommandName, 'help'>, string> = {
  keygen: `payload-markdown-docs keygen

Options:
  --format <pem|base64>  Output key format. Defaults to pem.
  --out <dir>            Write docs-sync-public.pem and docs-sync-private.pem.
  --force                Overwrite existing key files when used with --out.
  --help                 Show this help.
`,
  manifest: `payload-markdown-docs manifest <docs-root>

Options:
  --source <id>              Manifest source id. Defaults to local-docs.
  --root <path>              Manifest source root label.
  --route-base <route>       Route base for validation. Defaults to /docs.
  --repository <repo>        Source repository metadata.
  --branch <branch>          Source branch metadata.
  --commit <sha>             Source commit metadata.
  --pretty                   Pretty-print JSON.
  --max-files <number>       Maximum file count.
  --max-file-bytes <number>  Maximum single file size.
  --max-total-bytes <number> Maximum total Markdown bytes.
  --help                     Show this help.
`,
  plan: `payload-markdown-docs plan <docs-root>

Options:
  --existing <path>          JSON array of existing docs records.
  --delete-behavior <value>  archive, delete, draft, or ignore.
  --json                     Print full plan JSON.
  --pretty                   Pretty-print JSON output.
  --source <id>              Manifest source id. Defaults to local-docs.
  --root <path>              Manifest source root label.
  --route-base <route>       Route base for validation. Defaults to /docs.
  --repository <repo>        Source repository metadata.
  --branch <branch>          Source branch metadata.
  --commit <sha>             Source commit metadata.
  --max-files <number>       Maximum file count.
  --max-file-bytes <number>  Maximum single file size.
  --max-total-bytes <number> Maximum total Markdown bytes.
  --help                     Show this help.
`,
  push: `payload-markdown-docs push <docs-root>

Options:
  --endpoint <url>           Full Payload sync endpoint URL.
  --key-id <id>              Server-configured Ed25519 key id.
  --private-key-file <path>  PEM private key file from keygen.
  --private-key-env <name>   Environment variable containing the private key.
  --dry-run                  Upload as dry-run mode. This is the default.
  --sync                     Upload as sync mode. Requires server sync.allowWrites.
  --delete-behavior <value>  archive or ignore. Defaults to archive.
  --json                     Print structured JSON output.
  --pretty                   Pretty-print JSON output with --json.
  --source <id>              Manifest source id. Defaults to local-docs.
  --root <path>              Manifest source root label.
  --route-base <route>       Route base for local validation. Defaults to /docs.
  --repository <repo>        Source repository metadata.
  --branch <branch>          Source branch metadata.
  --commit <sha>             Source commit metadata.
  --max-files <number>       Maximum file count.
  --max-file-bytes <number>  Maximum single file size.
  --max-total-bytes <number> Maximum total Markdown bytes.
  --help                     Show this help.

Publishing, hard delete, and draft delete behavior are not implemented yet.
`,
  validate: `payload-markdown-docs validate <docs-root>

Options:
  --json                     Print validation JSON.
  --pretty                   Pretty-print JSON output.
  --source <id>              Manifest source id. Defaults to local-docs.
  --root <path>              Manifest source root label.
  --route-base <route>       Route base for validation. Defaults to /docs.
  --repository <repo>        Source repository metadata.
  --branch <branch>          Source branch metadata.
  --commit <sha>             Source commit metadata.
  --max-files <number>       Maximum file count.
  --max-file-bytes <number>  Maximum single file size.
  --max-total-bytes <number> Maximum total Markdown bytes.
  --help                     Show this help.
`,
}

const getHelpForArgs = (args: ParsedCliArgs): string => {
  if (args.command !== 'help') {
    return commandHelp[args.command]
  }

  const topic = getFlagString(args, 'topic') ?? args.positionals[0]

  if (
    topic === 'keygen' ||
    topic === 'manifest' ||
    topic === 'plan' ||
    topic === 'push' ||
    topic === 'validate'
  ) {
    return commandHelp[topic]
  }

  return helpText
}

export const runCli = async (argv: string[]): Promise<CliResult> => {
  try {
    const parsed = parseCliArgs(argv)

    if (!parsed.ok) {
      return {
        exitCode: 1,
        stderr: `${parsed.error}\n`,
      }
    }

    if (parsed.args.command === 'help' || parsed.args.flags.help === true) {
      return {
        exitCode: 0,
        stdout: getHelpForArgs(parsed.args),
      }
    }

    if (parsed.args.command === 'keygen') {
      return runKeygenCommand(parsed.args)
    }

    if (parsed.args.command === 'manifest') {
      return runManifestCommand(parsed.args)
    }

    if (parsed.args.command === 'plan') {
      return runPlanCommand(parsed.args)
    }

    if (parsed.args.command === 'push') {
      return runPushCommand(parsed.args)
    }

    if (parsed.args.command === 'validate') {
      return runValidateCommand(parsed.args)
    }

    return {
      exitCode: 1,
      stderr: 'Unknown command.\n',
    }
  } catch (error) {
    return {
      exitCode: 2,
      stderr: error instanceof Error ? `${error.message}\n` : 'Unexpected internal error.\n',
    }
  }
}

const isCliEntrypoint = (): boolean => {
  if (!process.argv[1]) {
    return false
  }

  return fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
}

if (isCliEntrypoint()) {
  const result = await runCli(process.argv.slice(2))

  if (result.stdout) {
    process.stdout.write(result.stdout)
  }

  if (result.stderr) {
    process.stderr.write(result.stderr)
  }

  process.exitCode = result.exitCode
}
