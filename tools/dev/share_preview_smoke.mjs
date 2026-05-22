#!/usr/bin/env node

import crypto from 'node:crypto'
import net from 'node:net'
import tls from 'node:tls'

const origin = new URL(process.env.VH_ORIGIN || 'https://vh.home.arpa')
const shareToken = process.env.VH_SHARE_TOKEN
const previewPath = process.env.VH_PREVIEW_PATH
const downloadPath = process.env.VH_DOWNLOAD_PATH
const deniedPreviewPath = process.env.VH_DENIED_PREVIEW_PATH
const insecure = process.env.VH_INSECURE === '1'

if (insecure) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

if (!shareToken || !previewPath || !downloadPath) {
  console.error([
    'Usage:',
    '  VH_SHARE_TOKEN=<public-share-token> \\',
    '  VH_PREVIEW_PATH=/image.jpg \\',
    '  VH_DOWNLOAD_PATH=/image.jpg \\',
    '  VH_DENIED_PREVIEW_PATH=/optional-denied.jpg \\',
    '  VH_ORIGIN=https://vh.home.arpa VH_INSECURE=1 \\',
    '  node tools/dev/share_preview_smoke.mjs',
  ].join('\n'))
  process.exit(2)
}

const readUntil = (socket, marker, initial = Buffer.alloc(0)) => new Promise((resolve, reject) => {
  let buffer = initial
  const cleanup = () => {
    socket.off('data', onData)
    socket.off('error', onError)
  }
  const onError = error => {
    cleanup()
    reject(error)
  }
  const onData = chunk => {
    buffer = Buffer.concat([buffer, chunk])
    const index = buffer.indexOf(marker)
    if (index === -1) return
    cleanup()
    resolve({
      head: buffer.subarray(0, index + marker.length).toString('utf8'),
      rest: buffer.subarray(index + marker.length),
    })
  }
  socket.on('data', onData)
  socket.on('error', onError)
})

const makeSocket = () => new Promise((resolve, reject) => {
  const port = Number(origin.port || (origin.protocol === 'https:' ? 443 : 80))
  const host = origin.hostname
  const socket = origin.protocol === 'https:' ?
    tls.connect({ host, port, servername: host, rejectUnauthorized: !insecure })
  : net.connect({ host, port })
  socket.once(origin.protocol === 'https:' ? 'secureConnect' : 'connect', () => resolve(socket))
  socket.once('error', reject)
})

const wsFrame = text => {
  const payload = Buffer.from(text, 'utf8')
  const mask = crypto.randomBytes(4)
  let header
  if (payload.length < 126) {
    header = Buffer.from([0x81, 0x80 | payload.length])
  } else if (payload.length < 65536) {
    header = Buffer.alloc(4)
    header[0] = 0x81
    header[1] = 0x80 | 126
    header.writeUInt16BE(payload.length, 2)
  } else {
    header = Buffer.alloc(10)
    header[0] = 0x81
    header[1] = 0x80 | 127
    header.writeBigUInt64BE(BigInt(payload.length), 2)
  }
  const masked = Buffer.alloc(payload.length)
  for (let i = 0; i < payload.length; i += 1) masked[i] = payload[i] ^ mask[i % 4]
  return Buffer.concat([header, mask, masked])
}

const tryParseFrame = buffer => {
  if (buffer.length < 2) return null
  const opcode = buffer[0] & 0x0f
  const masked = (buffer[1] & 0x80) !== 0
  let length = buffer[1] & 0x7f
  let offset = 2
  if (length === 126) {
    if (buffer.length < offset + 2) return null
    length = buffer.readUInt16BE(offset)
    offset += 2
  } else if (length === 127) {
    if (buffer.length < offset + 8) return null
    length = Number(buffer.readBigUInt64BE(offset))
    offset += 8
  }
  const maskOffset = offset
  if (masked) offset += 4
  if (buffer.length < offset + length) return null
  let payload = buffer.subarray(offset, offset + length)
  if (masked) {
    const mask = buffer.subarray(maskOffset, maskOffset + 4)
    payload = Buffer.from(payload.map((byte, index) => byte ^ mask[index % 4]))
  }
  return { opcode, text: payload.toString('utf8'), rest: buffer.subarray(offset + length) }
}

const openShareSession = async () => {
  const socket = await makeSocket()
  const key = crypto.randomBytes(16).toString('base64')
  socket.write([
    `GET /ws/share HTTP/1.1`,
    `Host: ${origin.host}`,
    `Origin: ${origin.origin}`,
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Key: ${key}`,
    'Sec-WebSocket-Version: 13',
    '\r\n',
  ].join('\r\n'))

  const { head, rest } = await readUntil(socket, Buffer.from('\r\n\r\n'))
  if (!head.startsWith('HTTP/1.1 101') && !head.startsWith('HTTP/1.0 101')) {
    throw new Error(`WebSocket upgrade failed:\n${head}`)
  }

  const cookies = head
    .split('\r\n')
    .filter(line => line.toLowerCase().startsWith('set-cookie:'))
    .map(line => line.slice(line.indexOf(':') + 1).trim().split(';')[0])

  const requestId = crypto.randomUUID()
  socket.write(wsFrame(JSON.stringify({
    command: 'share.session.open',
    payload: { public_token: shareToken },
    requestId,
  })))

  let buffer = rest
  while (true) {
    const parsed = tryParseFrame(buffer)
    if (parsed) {
      buffer = parsed.rest
      if (parsed.opcode === 8) throw new Error('WebSocket closed before share.session.open response')
      if (parsed.opcode === 1) {
        const message = JSON.parse(parsed.text)
        if (message.requestId === requestId) {
          socket.end()
          if (message.status === 'ERROR' || message.status === 'UNAUTHORIZED' || message.status === 'INTERNAL_ERROR')
            throw new Error(message.error || message.message || 'share.session.open failed')
          return { cookies, response: message.data }
        }
      }
      continue
    }
    const chunk = await new Promise((resolve, reject) => {
      socket.once('data', resolve)
      socket.once('error', reject)
    })
    buffer = Buffer.concat([buffer, chunk])
  }
}

const request = async (label, pathname, expected) => {
  const url = new URL(pathname, origin)
  const response = await fetch(url, {
    headers: cookieHeader ? { cookie: cookieHeader } : {},
    redirect: 'manual',
  })
  const ok = expected(response.status)
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: ${response.status} ${url.pathname}${url.search}`)
  if (!ok) process.exitCode = 1
}

const { cookies, response } = await openShareSession()
const cookieHeader = cookies.join('; ')
console.log(`PASS /ws/share: opened session ${response.status}`)

await request('/share/[token]', `/share/${encodeURIComponent(shareToken)}`, status => status >= 200 && status < 400)

const previewUrl = new URL('/preview', origin)
previewUrl.searchParams.set('share', '1')
previewUrl.searchParams.set('path', previewPath)
previewUrl.searchParams.set('size', '64')
await request('/preview allowed', `${previewUrl.pathname}${previewUrl.search}`, status => status === 200)

if (deniedPreviewPath) {
  const deniedUrl = new URL('/preview', origin)
  deniedUrl.searchParams.set('share', '1')
  deniedUrl.searchParams.set('path', deniedPreviewPath)
  deniedUrl.searchParams.set('size', '64')
  await request('/preview denied', `${deniedUrl.pathname}${deniedUrl.search}`, status => status === 401 || status === 403)
}

const downloadUrl = new URL('/download', origin)
downloadUrl.searchParams.set('share', '1')
downloadUrl.searchParams.set('path', downloadPath)
await request('/download allowed', `${downloadUrl.pathname}${downloadUrl.search}`, status => status === 200)
