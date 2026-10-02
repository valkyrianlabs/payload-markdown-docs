// Seeds what an admin creates by hand: one docs set and one Ed25519 sync key scoped to it.
import config from '@payload-config'
import fs from 'fs'
import { getPayload } from 'payload'

const publicKey = fs.readFileSync(process.env.SMOKE_PUBLIC_KEY_FILE as string, 'utf8')
const payload = await getPayload({ config })

const docsSet = await payload.create({
  collection: 'docs-sets',
  data: { _status: 'published', slug: 'smoke', title: 'Smoke' } as never,
  overrideAccess: true,
})
await payload.create({
  collection: 'docs-access',
  data: {
    accessType: 'ed25519',
    docsSets: [docsSet.id],
    keyId: 'smoke',
    publicKey,
    title: 'Smoke key',
  } as never,
  overrideAccess: true,
})
console.log('[smoke] seeded docs set + scoped sync key')
process.exit(0)
