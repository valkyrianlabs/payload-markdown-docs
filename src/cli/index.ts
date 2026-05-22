#!/usr/bin/env node

import { realpathSync } from 'node:fs'
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
  payload-markdown-docs validate [docs-root] [options]
  payload-markdown-docs manifest [docs-root] [options]
  payload-markdown-docs plan [docs-root] [options]
  payload-markdown-docs push [docs-root] [options]
  payload-markdown-docs keygen [options]
  payload-markdown-docs install skill --agent codex [options]
  payload-markdown-docs install routes [options]

Commands:
  validate   Validate a local docs package.
  manifest   Print a JSON docs package manifest.
  plan       Build a sync plan against optional existing docs records.
  push       Sign and upload a docs package manifest to a Payload sync endpoint.
  keygen     Generate Ed25519 keys for signed sync.
  install    Install local AI-agent guidance or Next route files for docs assets.
`

const commandHelp: Record<Exclude<CliCommandName, 'help'>, string> = {
  install: `payload-markdown-docs install skill --agent codex

Targets:
  payload-markdown-docs install skill --agent codex
  payload-markdown-docs install skill --agent claude
  payload-markdown-docs install skill --claude
  payload-markdown-docs install routes

Options:
  --codex                         Install the Codex skill pack.
  --claude                        Install the Claude skill pack.
  --agent <codex|claude>          Agent target.
  --out <path>                    Output directory for the payload-markdown-docs skill. Defaults to .agents/skills/payload-markdown-docs for Codex and .claude/skills/payload-markdown-docs for Claude.
  --docs-root <path>              Docs root to mention in installed guidance. Defaults to ./docs.
  --package-manager <name>        pnpm, npm, yarn, or bun. Auto-detected when omitted.
  --payload-app <path>             Payload app route group for route installs. Defaults to src/app/(payload), app/(payload), or dev/app/(payload) when found.
  --app <path>                     Alias for --payload-app.
  --force                         Overwrite existing skill files.
  --dry-run                       Print planned files without writing.
  --help                          Show this help.

Default Codex installs also create or update AGENTS.md so Codex can discover the skill guidance.
Default Claude installs do not create or update AGENTS.md.
Skill installs also copy the companion @valkyrianlabs/payload-markdown skill beside the payload-markdown-docs skill.
Install commands do not sync docs, call Payload, or run package manager commands.
Route installs add exact Next App Router files for /llms.txt, /llms-full.txt, and docs-set skill asset URLs so those public routes can reach the plugin-owned Payload asset handlers instead of the frontend catch-all.
`,
  keygen: `payload-markdown-docs keygen

Options:
  --format <pem|base64>  Output key format. Defaults to pem.
  --out <dir>            Write docs-sync-public.pem and docs-sync-private.pem.
  --force                Overwrite existing key files when used with --out.
  --help                 Show this help.
`,
  manifest: `payload-markdown-docs manifest [docs-root]

Options:
  --docs <path>             Docs source root. Defaults to ./docs.
  --skills <path>           Skills source root. Defaults to ./skills.
  --llms <path>             llms.txt path. Defaults to ./llms.txt.
  --llms-full <path>        llms-full.txt path. Defaults to ./llms-full.txt.
  --no-docs                 Exclude Markdown docs records.
  --no-skills               Exclude skill artifacts.
  --no-llms                 Exclude llms.txt.
  --no-llms-full            Exclude llms-full.txt.
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
  plan: `payload-markdown-docs plan [docs-root]

Options:
  --docs <path>             Docs source root. Defaults to ./docs.
  --skills <path>           Skills source root. Defaults to ./skills.
  --llms <path>             llms.txt path. Defaults to ./llms.txt.
  --llms-full <path>        llms-full.txt path. Defaults to ./llms-full.txt.
  --no-docs                 Exclude Markdown docs records.
  --no-skills               Exclude skill artifacts.
  --no-llms                 Exclude llms.txt.
  --no-llms-full            Exclude llms-full.txt.
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
  push: `payload-markdown-docs push [docs-root]

Options:
  --docs <path>             Docs source root. Defaults to ./docs.
  --skills <path>           Skills source root. Defaults to ./skills.
  --llms <path>             llms.txt path. Defaults to ./llms.txt.
  --llms-full <path>        llms-full.txt path. Defaults to ./llms-full.txt.
  --no-docs                 Exclude Markdown docs records.
  --no-skills               Exclude skill artifacts.
  --no-llms                 Exclude llms.txt.
  --no-llms-full            Exclude llms-full.txt.
  --endpoint <url>           Full Payload sync endpoint URL.
  --key-id <id>              Server-configured Ed25519 key id.
  --private-key-file <path>  Private key file from keygen, or an unencrypted OpenSSH Ed25519 key.
  --private-key-env <name>   Environment variable containing the private key.
  --github-oidc              Use GitHub Actions OIDC bearer auth instead of Ed25519.
  --oidc-token-env <name>    Environment variable containing an already-fetched OIDC token.
  --dry-run                  Validate and submit a dry-run request without applying writes.
  --strict-routes            Fail when assets are included but public Next asset route files are missing.
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
    payload-markdown-docs push --endpoint "$DOCS_SYNC_ENDPOINT" --source main-docs --key-id github-actions-main --private-key-env DOCS_SYNC_PRIVATE_KEY

  GitHub OIDC:
    payload-markdown-docs push --endpoint "$DOCS_SYNC_ENDPOINT" --source main-docs --github-oidc

GitHub OIDC requires workflow permissions: id-token: write and contents: read.
Hard delete requires explicit server sync.allowHardDelete. Existing collection and block targets are not supported yet.
`,
  validate: `payload-markdown-docs validate [docs-root]

Options:
  --docs <path>             Docs source root. Defaults to ./docs.
  --skills <path>           Skills source root. Defaults to ./skills.
  --llms <path>             llms.txt path. Defaults to ./llms.txt.
  --llms-full <path>        llms-full.txt path. Defaults to ./llms-full.txt.
  --no-docs                 Exclude Markdown docs records.
  --no-skills               Exclude skill artifacts.
  --no-llms                 Exclude llms.txt.
  --no-llms-full            Exclude llms-full.txt.
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

type CliEntrypointOptions = {
  argvPath?: string
  modulePath?: string
}

const resolveEntrypointPath = (input: string): string => {
  const resolved = path.resolve(input)

  try {
    return realpathSync(resolved)
  } catch {
    return resolved
  }
}

export const isCliEntrypoint = ({
  argvPath = process.argv[1],
  modulePath = fileURLToPath(import.meta.url),
}: CliEntrypointOptions = {}): boolean => {
  if (!argvPath) {
    return false
  }

  return resolveEntrypointPath(modulePath) === resolveEntrypointPath(argvPath)
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
