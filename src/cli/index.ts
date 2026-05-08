#!/usr/bin/env node

import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { CliCommandName, CliResult, ParsedCliArgs } from './types.js'

import { runInstallCommand } from './commands/install.js'
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
  payload-markdown-docs install skill --codex [options]

Commands:
  validate   Validate a local Markdown docs directory.
  manifest   Print a JSON docs manifest for a local Markdown docs directory.
  plan       Build a dry sync plan against optional existing docs records.
  push       Sign and upload a docs manifest to a Payload sync endpoint.
  keygen     Generate Ed25519 keys for signed sync.
  install    Install local AI-agent guidance for docs maintenance.
`

const commandHelp: Record<Exclude<CliCommandName, 'help'>, string> = {
  install: `payload-markdown-docs install skill --codex

Aliases:
  payload-markdown-docs install ai-skill --codex
  payload-markdown-docs install skill --agent codex

Options:
  --codex                         Install the Codex skill pack.
  --agent <codex>                 Agent target. Currently only codex.
  --out <path>                    Output directory. Defaults to .agents/skills/payload-markdown-docs.
  --docs-root <path>              Docs root to mention in installed guidance. Defaults to ./docs.
  --package-manager <name>        pnpm, npm, yarn, or bun. Auto-detected when omitted.
  --force                         Overwrite existing skill files.
  --dry-run                       Print planned files without writing.
  --help                          Show this help.

Installs local AI-agent guidance only. It does not sync docs, call Payload, or run package manager commands.
`,
  keygen: `payload-markdown-docs keygen

Options:
  --format <pem|base64>  Output key format. Defaults to pem.
  --out <dir>            Write docs-sync-public.pem and docs-sync-private.pem.
  --force                Overwrite existing key files when used with --out.
  --help                 Show this help.
`,
  manifest: `payload-markdown-docs manifest <docs-root>

Options:
  --source <id>              Docs set slug. Defaults to the GitHub repository name in GitHub Actions, otherwise local-docs.
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
  --source <id>              Docs set slug. Defaults to the GitHub repository name in GitHub Actions, otherwise local-docs.
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
  --github-oidc              Use GitHub Actions OIDC bearer auth instead of Ed25519.
  --oidc-token-env <name>    Environment variable containing an already-fetched OIDC token.
  --dry-run                  Upload as dry-run mode. This is the default.
  --sync                     Upload as sync mode. Requires server sync.allowWrites.
  --publish                  Request published output. Server must allow publishing.
  --delete-behavior <value>  archive, delete, draft, or ignore. Defaults to archive.
  --json                     Print structured JSON output.
  --pretty                   Pretty-print JSON output with --json.
  --source <id>              Docs set slug. Defaults to the GitHub repository name in GitHub Actions, otherwise local-docs.
  --repository <repo>        Source repository metadata.
  --branch <branch>          Source branch metadata.
  --commit <sha>             Source commit metadata.
  --max-files <number>       Maximum file count.
  --max-file-bytes <number>  Maximum single file size.
  --max-total-bytes <number> Maximum total Markdown bytes.
  --help                     Show this help.

Examples:
  Ed25519:
    payload-markdown-docs push ./docs --endpoint "$DOCS_SYNC_ENDPOINT" --source main-docs --key-id github-actions-main --private-key-env DOCS_SYNC_PRIVATE_KEY --sync

  GitHub OIDC:
    payload-markdown-docs push ./docs --endpoint "$DOCS_SYNC_ENDPOINT" --github-oidc --sync

GitHub OIDC requires workflow permissions: id-token: write and contents: read.
Hard delete requires explicit server sync.allowHardDelete. Existing collection and block targets are not supported yet.
`,
  validate: `payload-markdown-docs validate <docs-root>

Options:
  --json                     Print validation JSON.
  --pretty                   Pretty-print JSON output.
  --source <id>              Docs set slug. Defaults to the GitHub repository name in GitHub Actions, otherwise local-docs.
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
    topic === 'install' ||
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

    if (parsed.args.command === 'install') {
      return runInstallCommand(parsed.args)
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
