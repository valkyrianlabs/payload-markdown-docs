import { createHash } from 'node:crypto'

export const sha256Hex = (content: string | Uint8Array): string => {
  const hash = createHash('sha256')

  hash.update(content)

  return hash.digest('hex')
}
