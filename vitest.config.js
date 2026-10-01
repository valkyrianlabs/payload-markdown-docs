import path from 'path'
import { loadEnv } from 'payload/node'
import { fileURLToPath } from 'url'
import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default defineConfig(() => {
  loadEnv(path.resolve(dirname, './dev'))

  return {
    plugins: [
      tsconfigPaths({
        ignoreConfigErrors: true,
      }),
    ],
    test: {
      environment: 'node',
      // Every DB-backed spec boots Payload against the same database, and Payload's dev
      // schema push is not safe to run concurrently. Run files serially for DB runs.
      fileParallelism: process.env.PAYLOAD_MARKDOWN_DOCS_RUN_DB_TESTS !== '1',
      exclude: ['**/e2e.spec.ts', '**/node_modules/**', '**/dist/**'],
      hookTimeout: 30_000,
      include: ['dev/**/*.spec.ts', 'src/**/*.spec.ts'],
      testTimeout: 30_000,
    },
  }
})
