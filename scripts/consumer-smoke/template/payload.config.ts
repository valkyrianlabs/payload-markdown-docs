import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { payloadMarkdown } from '@valkyrianlabs/payload-markdown'
import { payloadMarkdownDocs } from '@valkyrianlabs/payload-markdown-docs'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'

const dirname = path.dirname(fileURLToPath(import.meta.url))

// Minimal consumer app, installed exactly as the README says. It deliberately has no
// `media` upload collection (the plugin must cope). The non-default Shiki theme proves
// the app's payloadMarkdown() options reach the renderer that docs pages use.
export default buildConfig({
  admin: { importMap: { baseDir: dirname } },
  collections: [{ slug: 'users', auth: true, fields: [] }],
  db: sqliteAdapter({
    client: { url: process.env.DATABASE_URI || `file:${path.resolve(dirname, 'smoke.db')}` },
  }),
  editor: lexicalEditor(),
  plugins: [
    payloadMarkdown({ code: { shikiTheme: 'github-light' } }),
    payloadMarkdownDocs({
      auth: { ed25519: true },
      enabled: true,
      sync: { allowPublish: true, allowWrites: true, deleteBehavior: 'archive' },
      target: { type: 'docsCollection', enableDrafts: true },
    }),
  ],
  secret: process.env.PAYLOAD_SECRET || 'consumer-smoke-secret',
  typescript: { autoGenerate: false },
})
