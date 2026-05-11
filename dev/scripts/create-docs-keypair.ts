import { generateKeyPairSync } from 'node:crypto'
import { access, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

type GeneratedKeys = {
  privateKey: string
  publicKey: string
}

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

const run = async () => {
  const keys = generatePemKeys()
  const absoluteOutDir = path.resolve('dev/.docs-sync')
  const publicKeyPath = path.join(absoluteOutDir, 'docs-sync-public.pem')
  const privateKeyPath = path.join(absoluteOutDir, 'docs-sync-private.pem')
  const force = process.argv.includes('--force')
  const publicExists = await fileExists(publicKeyPath)
  const privateExists = await fileExists(privateKeyPath)

  if (!force && (publicExists || privateExists)) {
    process.stderr.write(
      'Key files already exist. Use --force to overwrite docs-sync-public.pem and docs-sync-private.pem.\n',
    )
    process.exitCode = 1

    return
  }

  await mkdir(absoluteOutDir, {
    recursive: true,
  })
  await writeFile(publicKeyPath, `${keys.publicKey.trim()}\n`, 'utf8')
  await writeFile(privateKeyPath, `${keys.privateKey.trim()}\n`, 'utf8')

  process.stdout.write(`Wrote public key: ${publicKeyPath}\n`)
  process.stdout.write(`Wrote private key: ${privateKeyPath}\n`)
}

await run()
