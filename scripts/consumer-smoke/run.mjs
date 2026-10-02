#!/usr/bin/env node
// pnpm consumer smoke test for @valkyrianlabs/payload-markdown + @valkyrianlabs/payload-markdown-docs.
//
// Installs packed tarballs into a fresh Next.js + Payload app exactly as the README instructs, then:
//   1. exactly one copy of core and of @payloadcms/ui is installed
//   2. every admin import-map specifier resolves from the app root
//   3. `next build` succeeds (the app has no `media` collection)
//   4. `pmdocs push` sends a signed sync to the running app and the pages render through REAL core
//      with the app's own payloadMarkdown() options (single config context) and core CSS present.
//
// Usage:
//   node scripts/consumer-smoke/run.mjs --core <core.tgz> --docs <docs.tgz> --pmdocs <path/to/pmdocs>
//        [--versions-from <dir with node_modules>] [--workdir <dir>] [--port 3990] [--keep]
// Env: PNPM (default "pnpm"; e.g. "corepack pnpm").
import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const args = {}
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i]
  if (!arg.startsWith('--')) continue
  const next = process.argv[i + 1]
  args[arg.slice(2)] = next === undefined || next.startsWith('--') ? 'true' : (i++, next)
}
const required = (name) => {
  if (!args[name]) throw new Error(`--${name} is required`)
  return path.resolve(args[name])
}

const coreTarball = required('core')
const docsTarball = required('docs')
const pmdocs = args.pmdocs ? path.resolve(args.pmdocs) : 'pmdocs'
const port = Number(args.port || 3990)
const versionsFrom = path.resolve(args['versions-from'] || path.join(here, '..', '..'))
const work = path.resolve(args.workdir || fs.mkdtempSync(path.join(os.tmpdir(), 'pmd-consumer-')))
const [pnpmBin, ...pnpmPrefix] = (process.env.PNPM || 'pnpm').split(' ')

const results = []
const check = (name, ok, detail = '') => {
  results.push({ detail, name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`)
  if (!ok) process.exitCode = 1
}
const run = (cmd, cmdArgs, opts = {}) =>
  execFileSync(cmd, cmdArgs, { cwd: work, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], ...opts })
const pnpm = (cmdArgs, opts) => run(pnpmBin, [...pnpmPrefix, ...cmdArgs], opts)
const versionOf = (pkg) =>
  JSON.parse(fs.readFileSync(fs.realpathSync(path.join(versionsFrom, 'node_modules', pkg, 'package.json')), 'utf8'))
    .version

// The documented install: the docs plugin plus its peer packages, at the versions the repo tests with.
const PEERS_AND_APP_DEPS = [
  '@payloadcms/db-sqlite', '@payloadcms/next', '@payloadcms/plugin-seo', '@payloadcms/richtext-lexical',
  '@payloadcms/ui', '@tailwindcss/postcss', '@tailwindcss/typography', '@types/node', '@types/react',
  '@types/react-dom', 'graphql', 'next', 'payload', 'react', 'react-dom', 'tailwindcss', 'typescript',
]

fs.cpSync(path.join(here, 'template'), work, { recursive: true })
const dependencies = Object.fromEntries(PEERS_AND_APP_DEPS.map((pkg) => [pkg, args[`version:${pkg}`] || versionOf(pkg)]))
dependencies['@valkyrianlabs/payload-markdown'] = `file:${coreTarball}`
dependencies['@valkyrianlabs/payload-markdown-docs'] = `file:${docsTarball}`
fs.writeFileSync(
  path.join(work, 'package.json'),
  `${JSON.stringify(
    {
      dependencies,
      name: 'pmd-consumer-smoke',
      packageManager: 'pnpm@10.33.0',
      pnpm: { onlyBuiltDependencies: ['@swc/core', 'esbuild', 'sharp', 'unrs-resolver'] },
      private: true,
      type: 'module',
    },
    null,
    2,
  )}\n`,
)
console.log(`[smoke] workdir ${work}`)

let server
try {
  // 1. install like a user
  const install = pnpm(['install', '--no-frozen-lockfile'])
  const peerIssues = install.split('\n').filter((line) => /unmet peer|missing peer/i.test(line))
  check('install', true, peerIssues.length ? `peer warnings: ${peerIssues.join(' | ')}` : 'no peer warnings')
  const pnpmDir = path.join(work, 'node_modules', '.pnpm')
  const copies = (pattern) => fs.readdirSync(pnpmDir).filter((dir) => pattern.test(dir))
  const coreCopies = copies(/^@valkyrianlabs\+payload-markdown@/)
  check('single payload-markdown copy', coreCopies.length === 1, coreCopies.join(', '))
  const uiCopies = copies(/^@payloadcms\+ui@/)
  check('single @payloadcms/ui copy', uiCopies.length === 1, uiCopies.join(', '))

  // 2. import map
  pnpm(['exec', 'payload', 'generate:importmap'])
  const importMap = fs.readFileSync(path.join(work, 'app', '(payload)', 'admin', 'importMap.js'), 'utf8')
  const specifiers = [...new Set([...importMap.matchAll(/from ['"]([^'"]+)['"]/g)].map((match) => match[1]))]
  const unresolved = specifiers.filter((specifier) => {
    try {
      execFileSync(process.execPath, ['--input-type=module', '-e', `import.meta.resolve(${JSON.stringify(specifier)})`], {
        cwd: work,
        stdio: 'pipe',
      })
      return false
    } catch {
      return true
    }
  })
  check(
    'import map resolves from the app root',
    unresolved.length === 0 && specifiers.some((s) => s.startsWith('@valkyrianlabs/payload-markdown/')),
    `${specifiers.length} specifiers${unresolved.length ? `; unresolved: ${unresolved.join(', ')}` : ''}`,
  )

  // 3. production build
  try {
    pnpm(['exec', 'next', 'build'], { env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } })
    check('next build', true)
  } catch (error) {
    check('next build', false, `${error.stdout || ''}${error.stderr || ''}`.split('\n').slice(-40).join('\n'))
  }

  // 4. schema + seed (dev-mode schema push), signed sync through pmdocs, render through real core
  const keys = path.join(work, 'keys')
  run(pmdocs, ['keygen', '--out', keys])
  pnpm(['exec', 'payload', 'run', './seed.ts'], {
    env: { ...process.env, NODE_ENV: 'development', SMOKE_PUBLIC_KEY_FILE: path.join(keys, 'docs-sync-public.pem') },
  })
  server = spawn(pnpmBin, [...pnpmPrefix, 'exec', 'next', 'start', '-p', String(port)], {
    cwd: work,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let serverLog = ''
  server.stdout.on('data', (chunk) => (serverLog += chunk))
  server.stderr.on('data', (chunk) => (serverLog += chunk))
  const base = `http://127.0.0.1:${port}`
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${base}/api/users/me`)).status < 500) break
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  try {
    const push = run(pmdocs, [
      'push', path.join(work, 'docs'),
      '--endpoint', `${base}/api/documentation/sync`,
      '--source', 'smoke', '--key-id', 'smoke',
      '--private-key-file', path.join(keys, 'docs-sync-private.pem'),
      '--publish', '--no-skills', '--no-llms', '--no-llms-full', '--json',
    ])
    check('pmdocs push (signed sync)', true, push.replace(/\s+/g, ' ').slice(0, 160))
  } catch (error) {
    check('pmdocs push (signed sync)', false, `${error.stdout || ''}${error.stderr || ''}`.slice(0, 2000))
  }

  const page = await fetch(`${base}/smoke`)
  const html = await page.text()
  check('docs index page 200', page.status === 200, `status ${page.status}`)
  check('core directive rendered', html.includes('data-directive="callout"'))
  check('core heading anchors', /<h1[^>]*data-heading-anchor="consumer-smoke"/.test(html))
  check('app payloadMarkdown() options apply on docs pages', html.includes('github-light'), 'Shiki theme github-light')
  const cssHrefs = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map((match) => match[1])
  let css = ''
  for (const href of cssHrefs) css += await (await fetch(new URL(href, base))).text()
  check('core stylesheet delivered', /md-code-enhanced|vl-md-/.test(css), `${cssHrefs.length} stylesheet(s)`)
  const sub = await fetch(`${base}/smoke/guide/install`)
  const subHtml = await sub.text()
  check('nested docs page 200', sub.status === 200, `status ${sub.status}`)
  check('relative .md link rewritten to the docs route', /href="\/smoke"/.test(subHtml))

  if (process.exitCode) console.log(serverLog.split('\n').slice(-60).join('\n'))
} catch (error) {
  check('smoke run', false, `${error.message}\n${error.stdout || ''}${error.stderr || ''}`.slice(0, 4000))
} finally {
  server?.kill('SIGTERM')
  fs.writeFileSync(path.join(work, 'smoke-results.json'), `${JSON.stringify({ results, work }, null, 2)}\n`)
  console.log(`[smoke] ${results.filter((result) => result.ok).length}/${results.length} checks passed`)
  if (args.keep !== 'true' && !process.exitCode) fs.rmSync(work, { force: true, recursive: true })
}
