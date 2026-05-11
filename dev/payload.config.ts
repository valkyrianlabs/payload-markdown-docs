import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import sharp from 'sharp'
import { fileURLToPath } from 'url'

import { payloadMarkdownDocs } from '../dist'
import { Header } from './Header/config'
import { testEmailAdapter } from './helpers/testEmailAdapter'
import './helpers/loadDevEnv'
import { seed } from './seed'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

if (!process.env.ROOT_DIR) {
  process.env.ROOT_DIR = dirname
}

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
  globals: [Header],
  onInit: async (payload) => {
    await seed(payload)
  },
  plugins: [
    payloadMarkdownDocs({
      enabled: true,
      sync: {
        allowHardDelete: false,
        allowPublish: true,
        allowWrites: true,
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
