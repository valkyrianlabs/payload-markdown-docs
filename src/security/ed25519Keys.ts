import {
  createPrivateKey,
  createPublicKey,
} from 'node:crypto'

const opensshPrivateKeyBegin = '-----BEGIN OPENSSH PRIVATE KEY-----'
const opensshPrivateKeyEnd = '-----END OPENSSH PRIVATE KEY-----'
const pkcs8Ed25519PrivateKeyDerPrefix = Buffer.from(
  '302e020100300506032b657004220420',
  'hex',
)
const spkiEd25519PublicKeyDerPrefix = Buffer.from(
  '302a300506032b6570032100',
  'hex',
)

class BufferReader {
  private offset = 0

  constructor(private readonly buffer: Buffer) {}

  readBytes(length: number): Buffer {
    if (length < 0 || this.remaining < length) {
      throw new DocsSyncKeyError('OpenSSH key data is truncated.')
    }

    const value = this.buffer.subarray(this.offset, this.offset + length)
    this.offset += length

    return value
  }

  readString(): Buffer {
    const length = this.readUInt32()

    return this.readBytes(length)
  }

  readUInt32(): number {
    if (this.remaining < 4) {
      throw new DocsSyncKeyError('OpenSSH key data is truncated.')
    }

    const value = this.buffer.readUInt32BE(this.offset)
    this.offset += 4

    return value
  }

  get remaining(): number {
    return this.buffer.length - this.offset
  }
}

export class DocsSyncKeyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DocsSyncKeyError'
  }
}

const packOpenSshString = (value: Buffer | string): Buffer => {
  const buffer = typeof value === 'string' ? Buffer.from(value, 'utf8') : value
  const length = Buffer.alloc(4)
  length.writeUInt32BE(buffer.length, 0)

  return Buffer.concat([length, buffer])
}

const normalizeBase64 = (value: string): string => value.replace(/\s+/g, '')

const createEd25519PrivateKeyFromSeed = (seed: Buffer) => {
  if (seed.length !== 32) {
    throw new DocsSyncKeyError('OpenSSH Ed25519 private key seed is invalid.')
  }

  return createPrivateKey({
    type: 'pkcs8',
    format: 'der',
    key: Buffer.concat([pkcs8Ed25519PrivateKeyDerPrefix, seed]),
  })
}

const createEd25519PublicKeyFromRaw = (publicKey: Buffer) => {
  if (publicKey.length !== 32) {
    throw new DocsSyncKeyError('OpenSSH Ed25519 public key is invalid.')
  }

  return createPublicKey({
    type: 'spki',
    format: 'der',
    key: Buffer.concat([spkiEd25519PublicKeyDerPrefix, publicKey]),
  })
}

const parseOpenSshPrivateKey = (privateKey: string) => {
  const begin = privateKey.indexOf(opensshPrivateKeyBegin)
  const end = privateKey.indexOf(opensshPrivateKeyEnd)

  if (begin < 0 || end < 0 || end <= begin) {
    throw new DocsSyncKeyError('OpenSSH private key PEM is invalid.')
  }

  const base64Body = privateKey.slice(begin + opensshPrivateKeyBegin.length, end)
  const data = Buffer.from(normalizeBase64(base64Body), 'base64')
  const authMagic = Buffer.from('openssh-key-v1\0', 'utf8')

  if (!data.subarray(0, authMagic.length).equals(authMagic)) {
    throw new DocsSyncKeyError('OpenSSH private key magic header is invalid.')
  }

  const reader = new BufferReader(data.subarray(authMagic.length))
  const cipherName = reader.readString().toString('utf8')
  const kdfName = reader.readString().toString('utf8')
  reader.readString()

  if (cipherName !== 'none' || kdfName !== 'none') {
    throw new DocsSyncKeyError(
      'Encrypted OpenSSH private keys are not supported. Use `payload-markdown-docs keygen --out .docs-sync` or provide an unencrypted PKCS#8 PEM Ed25519 private key.',
    )
  }

  const keyCount = reader.readUInt32()

  if (keyCount !== 1) {
    throw new DocsSyncKeyError('OpenSSH private key must contain exactly one key.')
  }

  reader.readString()
  const privateBlob = reader.readString()
  const privateReader = new BufferReader(privateBlob)
  const checkInt = privateReader.readUInt32()
  const repeatedCheckInt = privateReader.readUInt32()

  if (checkInt !== repeatedCheckInt) {
    throw new DocsSyncKeyError('OpenSSH private key check values do not match.')
  }

  const keyType = privateReader.readString().toString('utf8')

  if (keyType !== 'ssh-ed25519') {
    throw new DocsSyncKeyError(
      'Only Ed25519 private keys are supported for docs sync signing.',
    )
  }

  const publicKey = privateReader.readString()
  const privateKeyBytes = privateReader.readString()

  if (privateKeyBytes.length !== 64) {
    throw new DocsSyncKeyError('OpenSSH Ed25519 private key payload is invalid.')
  }

  if (!privateKeyBytes.subarray(32).equals(publicKey)) {
    throw new DocsSyncKeyError('OpenSSH Ed25519 private/public key data does not match.')
  }

  return createEd25519PrivateKeyFromSeed(privateKeyBytes.subarray(0, 32))
}

const parseOpenSshPublicKey = (publicKey: string) => {
  const [keyType, base64Key] = publicKey.trim().split(/\s+/, 3)

  if (keyType !== 'ssh-ed25519' || !base64Key) {
    throw new DocsSyncKeyError(
      'Only Ed25519 public keys are supported for docs sync verification.',
    )
  }

  const reader = new BufferReader(Buffer.from(base64Key, 'base64'))
  const parsedKeyType = reader.readString().toString('utf8')

  if (parsedKeyType !== 'ssh-ed25519') {
    throw new DocsSyncKeyError('OpenSSH public key type does not match ssh-ed25519.')
  }

  return createEd25519PublicKeyFromRaw(reader.readString())
}

export const getEd25519PrivateKeyInput = (privateKey: string) => {
  const trimmed = privateKey.trim()

  if (trimmed.includes('BEGIN OPENSSH PRIVATE KEY')) {
    return parseOpenSshPrivateKey(trimmed)
  }

  if (trimmed.includes('BEGIN')) {
    try {
      return createPrivateKey(trimmed)
    } catch {
      throw new DocsSyncKeyError(
        'Private key must be an Ed25519 PKCS#8 PEM key, base64 PKCS#8 DER key, or unencrypted OpenSSH Ed25519 private key.',
      )
    }
  }

  try {
    return createPrivateKey({
      type: 'pkcs8',
      format: 'der',
      key: Buffer.from(normalizeBase64(trimmed), 'base64'),
    })
  } catch {
    throw new DocsSyncKeyError(
      'Private key must be an Ed25519 PKCS#8 PEM key, base64 PKCS#8 DER key, or unencrypted OpenSSH Ed25519 private key.',
    )
  }
}

export const getEd25519PublicKeyInput = (publicKey: string) => {
  const trimmed = publicKey.trim()

  if (trimmed.startsWith('ssh-ed25519 ')) {
    return parseOpenSshPublicKey(trimmed)
  }

  if (trimmed.includes('BEGIN PUBLIC KEY')) {
    return trimmed
  }

  return createPublicKey({
    type: 'spki',
    format: 'der',
    key: Buffer.from(normalizeBase64(trimmed), 'base64'),
  })
}

export const buildOpenSshEd25519PublicKey = ({
  comment,
  publicKey,
}: {
  comment?: string
  publicKey: Buffer
}): string => {
  const blob = Buffer.concat([
    packOpenSshString('ssh-ed25519'),
    packOpenSshString(publicKey),
  ])

  return ['ssh-ed25519', blob.toString('base64'), comment].filter(Boolean).join(' ')
}
