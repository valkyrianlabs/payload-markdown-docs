import type { ParsedCliArgs } from '../../src/cli/types.js'

import { runKeygenCommand } from '../../src/cli/commands/keygen.js'

const args: ParsedCliArgs = {
  command: 'keygen',
  flags: {
    out: 'dev/.docs-sync',
    ...(process.argv.includes('--force') ? { force: true } : {}),
  },
  positionals: [],
}

const result = await runKeygenCommand(args)

if (result.stdout) {
  process.stdout.write(result.stdout)
}

if (result.stderr) {
  process.stderr.write(result.stderr)
}

process.exitCode = result.exitCode
