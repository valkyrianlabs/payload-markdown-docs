import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const devEnvPath = path.resolve(dirname, '../.env')

const stripSurroundingQuotes = (value: string): string => {
  const trimmed = value.trim()

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }

  return trimmed
}

export const loadDevEnv = (envPath = devEnvPath) => {
  let rawEnv: string

  try {
    rawEnv = readFileSync(envPath, 'utf8')
  } catch {
    return
  }

  for (const line of rawEnv.split(/\r?\n/)) {
    const trimmed = line.trim()

    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }

    const separatorIndex = trimmed.indexOf('=')

    if (separatorIndex <= 0) {
      continue
    }

    const key = trimmed.slice(0, separatorIndex).trim()

    if (!key || process.env[key] !== undefined) {
      continue
    }

    process.env[key] = stripSurroundingQuotes(trimmed.slice(separatorIndex + 1))
  }
}

loadDevEnv()
