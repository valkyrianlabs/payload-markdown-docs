import { generateKeyPairSync } from 'node:crypto'
import { access, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { CliResult, ParsedCliArgs } from '../types.js'

import { getFlagBoolean, getFlagString } from '../parseArgs.js'

type KeyFormat = 'base64' | 'pem'

type GeneratedKeys = {
  privateKey: string
  publicKey: string
}

const keyFormats = new Set<KeyFormat>(['base64', 'pem'])

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath)

    return true
  } catch {
    return false
  }
}

const generatePemKeys = (): GeneratedKeys => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
  })

  return {
    privateKey: privateKey.toString(),
    publicKey: publicKey.toString(),
  }
}

const generateBase64Keys = (): GeneratedKeys => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'der',
    },
    publicKeyEncoding: {
      type: 'spki',
      format: 'der',
    },
  })

  return {
    privateKey: Buffer.from(privateKey).toString('base64'),
    publicKey: Buffer.from(publicKey).toString('base64'),
  }
}

const formatKeysForStdout = ({ privateKey, publicKey }: GeneratedKeys): string =>
  `Public key:\n\n${publicKey.trim()}\n\nPrivate key:\n\n${privateKey.trim()}\n`

export const runKeygenCommand = async (
  args: ParsedCliArgs,
): Promise<CliResult> => {
  const format = (getFlagString(args, 'format') ?? 'pem') as KeyFormat

  if (!keyFormats.has(format)) {
    return {
      exitCode: 1,
      stderr: '--format must be pem or base64.\n',
    }
  }

  const keys = format === 'pem' ? generatePemKeys() : generateBase64Keys()
  const outDir = getFlagString(args, 'out')

  if (!outDir) {
    return {
      exitCode: 0,
      stdout: formatKeysForStdout(keys),
    }
  }

  const absoluteOutDir = path.resolve(outDir)
  const publicKeyPath = path.join(absoluteOutDir, 'docs-sync-public.pem')
  const privateKeyPath = path.join(absoluteOutDir, 'docs-sync-private.pem')
  const force = getFlagBoolean(args, 'force')
  const publicExists = await fileExists(publicKeyPath)
  const privateExists = await fileExists(privateKeyPath)

  if (!force && (publicExists || privateExists)) {
    return {
      exitCode: 1,
      stderr:
        'Key files already exist. Use --force to overwrite docs-sync-public.pem and docs-sync-private.pem.\n',
    }
  }

  await mkdir(absoluteOutDir, {
    recursive: true,
  })
  await writeFile(publicKeyPath, `${keys.publicKey.trim()}\n`, 'utf8')
  await writeFile(privateKeyPath, `${keys.privateKey.trim()}\n`, 'utf8')

  return {
    exitCode: 0,
    stdout: `Wrote public key: ${publicKeyPath}\nWrote private key: ${privateKeyPath}\n`,
  }
}

