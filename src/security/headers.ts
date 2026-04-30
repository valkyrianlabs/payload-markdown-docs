export const syncHeaderNames = {
  bodySha256: 'x-vl-md-docs-body-sha256',
  keyId: 'x-vl-md-docs-key-id',
  nonce: 'x-vl-md-docs-nonce',
  signature: 'x-vl-md-docs-signature',
  timestamp: 'x-vl-md-docs-timestamp',
} as const

export type SyncRequestHeaders = {
  bodySha256: string
  keyId: string
  nonce: string
  signature: string
  timestamp: string
}

export type ExtractSyncHeadersResult =
  | {
      header: string
      ok: false
    }
  | {
      headers: SyncRequestHeaders
      ok: true
    }

const displayHeaderNames: Record<keyof SyncRequestHeaders, string> = {
  bodySha256: 'X-VL-MD-DOCS-Body-SHA256',
  keyId: 'X-VL-MD-DOCS-Key-Id',
  nonce: 'X-VL-MD-DOCS-Nonce',
  signature: 'X-VL-MD-DOCS-Signature',
  timestamp: 'X-VL-MD-DOCS-Timestamp',
}

export const extractSyncRequestHeaders = (
  headers: Headers,
): ExtractSyncHeadersResult => {
  const extracted: Record<keyof SyncRequestHeaders, string | undefined> = {
    bodySha256: headers.get(syncHeaderNames.bodySha256) ?? undefined,
    keyId: headers.get(syncHeaderNames.keyId) ?? undefined,
    nonce: headers.get(syncHeaderNames.nonce) ?? undefined,
    signature: headers.get(syncHeaderNames.signature) ?? undefined,
    timestamp: headers.get(syncHeaderNames.timestamp) ?? undefined,
  }

  for (const key of Object.keys(extracted) as Array<keyof SyncRequestHeaders>) {
    const value = extracted[key]

    if (!value || value.trim() === '') {
      return {
        header: displayHeaderNames[key],
        ok: false,
      }
    }
  }

  return {
    headers: {
      bodySha256: extracted.bodySha256?.trim() ?? '',
      keyId: extracted.keyId?.trim() ?? '',
      nonce: extracted.nonce?.trim() ?? '',
      signature: extracted.signature?.trim() ?? '',
      timestamp: extracted.timestamp?.trim() ?? '',
    },
    ok: true,
  }
}
