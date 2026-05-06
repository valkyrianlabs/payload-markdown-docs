import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)
const devRoot = path.resolve(dirname, '..')

export const docsSyncKeyId = process.env.DOCS_SYNC_KEY_ID || 'dev-local'

export const readDocsSyncPublicKey = (): string | undefined => {
  if (process.env.DOCS_SYNC_PUBLIC_KEY) {
    return process.env.DOCS_SYNC_PUBLIC_KEY
  }

  const publicKeyFile = process.env.DOCS_SYNC_PUBLIC_KEY_FILE
    ? path.resolve(process.env.DOCS_SYNC_PUBLIC_KEY_FILE)
    : path.resolve(devRoot, '.docs-sync/docs-sync-public.pem')

  try {
    return fs.readFileSync(publicKeyFile, 'utf8')
  } catch {
    return undefined
  }
}
