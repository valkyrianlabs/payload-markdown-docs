import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { payloadMarkdownDocs } from '@valkyrianlabs/payload-markdown-docs'
import fs from 'fs'
import path from 'path'
import { buildConfig } from 'payload'
import sharp from 'sharp'
import { fileURLToPath } from 'url'

import { testEmailAdapter } from './helpers/testEmailAdapter.js'
import { seed } from './seed.js'
import './helpers/loadDevEnv.js'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

if (!process.env.ROOT_DIR) {
  process.env.ROOT_DIR = dirname
}

const readDocsSyncPublicKey = (): string | undefined => {
  if (process.env.DOCS_SYNC_PUBLIC_KEY) {
    return process.env.DOCS_SYNC_PUBLIC_KEY
  }

  const publicKeyFile = process.env.DOCS_SYNC_PUBLIC_KEY_FILE
    ? path.resolve(process.env.DOCS_SYNC_PUBLIC_KEY_FILE)
    : path.resolve(dirname, '.docs-sync/docs-sync-public.pem')

  try {
    return fs.readFileSync(publicKeyFile, 'utf8')
  } catch {
    return undefined
  }
}

const docsSyncPublicKey = readDocsSyncPublicKey()
const docsSyncKeyId = process.env.DOCS_SYNC_KEY_ID || 'dev-local'

export default buildConfig({
  admin: {
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [
    {
      slug: 'posts',
      fields: [],
    },
    {
      slug: 'media',
      fields: [],
      upload: {
        staticDir: path.resolve(dirname, 'media'),
      },
    },
  ],
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL || '',
    },
  }),
  editor: lexicalEditor(),
  email: testEmailAdapter,
  onInit: async (payload) => {
    await seed(payload)
  },
  plugins: [
    payloadMarkdownDocs({
      auth: docsSyncPublicKey
        ? {
            keys: [
              {
                id: docsSyncKeyId,
                publicKey: docsSyncPublicKey,
              },
            ],
            mode: 'ed25519',
          }
        : {
            mode: 'disabled',
          },
      enabled: true,
      sources: [
        {
          id: 'payload-markdown-docs',
          root: 'docs',
          routeBase: '/plugins/payload-markdown-docs',
        },
      ],
      sync: {
        allowHardDelete: false,
        allowPublish: true,
        allowWrites: true,
        defaultPublishMode: 'draft',
        deleteBehavior: 'archive',
      },
      target: {
        type: 'docsCollection',
        enableDrafts: true,
      },
    }),
  ],
  secret: process.env.PAYLOAD_SECRET || 'test-secret_key',
  sharp,
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
})
