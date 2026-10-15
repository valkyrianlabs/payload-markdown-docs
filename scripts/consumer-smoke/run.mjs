#!/usr/bin/env node
// pnpm consumer smoke test for payload-markdown + payload-markdown-docs, under either npm name of
// each (`--core-name`, `--docs-name`; the scoped names by default).
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
//        [--core-name payload-markdown|@valkyrianlabs/payload-markdown]
//        [--docs-name payload-markdown-docs|@valkyrianlabs/payload-markdown-docs]
//        [--versions-from <dir with node_modules>] [--workdir <dir>] [--port 3990] [--keep]
// A tarball packed under the other name is renamed first, the way vl-release derives the npm alias
// (package.json "name" and dist/package.js).
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

const coreName = args['core-name'] || '@valkyrianlabs/payload-markdown'
const docsName = args['docs-name'] || '@valkyrianlabs/payload-markdown-docs'
const pmdocs = args.pmdocs ? path.resolve(args.pmdocs) : 'pmdocs'
const port = Number(args.port || 3990)
const versionsFrom = path.resolve(args['versions-from'] || path.join(here, '..', '..'))
const work = path.resolve(args.workdir || fs.mkdtempSync(path.join(os.tmpdir(), 'pmd-consumer-')))
const [pnpmBin, ...pnpmPrefix] = (process.env.PNPM || 'pnpm').split(' ')

/** The tarball under `name`: as is, or renamed like vlr derives an [[npm.aliases]] package. */
const asPackage = (tarball, name) => {
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'pmd-rename-'))
  execFileSync('tar', ['-xzf', tarball, '-C', stage])
  const manifestPath = path.join(stage, 'package', 'package.json')
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  if (manifest.name === name) return tarball

  fs.writeFileSync(manifestPath, fs.readFileSync(manifestPath, 'utf8').replace(`"name": "${manifest.name}"`, `"name": "${name}"`))
  for (const member of ['dist/package.js', 'dist/package.js.map']) {
    const file = path.join(stage, 'package', member)
    if (fs.existsSync(file)) fs.writeFileSync(file, fs.readFileSync(file, 'utf8').split(manifest.name).join(name))
  }
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'pmd-renamed-'))
  execFileSync('npm', ['pack', '--ignore-scripts', '--pack-destination', out], { cwd: path.join(stage, 'package'), stdio: 'pipe' })
  return path.join(out, fs.readdirSync(out)[0])
}

const coreTarball = asPackage(required('core'), coreName)
const docsTarball = asPackage(required('docs'), docsName)

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
// The template names both packages through placeholders.
for (const file of fs.readdirSync(work, { recursive: true })) {
  const full = path.join(work, file)
  if (!fs.statSync(full).isFile() || !/\.(?:css|ts|tsx)$/.test(full)) continue
  const text = fs.readFileSync(full, 'utf8')
  const replaced = text.replaceAll('__PAYLOAD_MARKDOWN_DOCS__', docsName).replaceAll('__PAYLOAD_MARKDOWN__', coreName)
  if (replaced !== text) fs.writeFileSync(full, replaced)
}
const dependencies = Object.fromEntries(PEERS_AND_APP_DEPS.map((pkg) => [pkg, args[`version:${pkg}`] || versionOf(pkg)]))
dependencies[coreName] = `file:${coreTarball}`
dependencies[docsName] = `file:${docsTarball}`
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
console.log(`[smoke] workdir ${work} (${docsName} + ${coreName})`)

let server
try {
  // 1. install like a user
  const install = pnpm(['install', '--no-frozen-lockfile'])
  const peerIssues = install.split('\n').filter((line) => /unmet peer|missing peer/i.test(line))
  check('install', true, peerIssues.length ? `peer warnings: ${peerIssues.join(' | ')}` : 'no peer warnings')
  const pnpmDir = path.join(work, 'node_modules', '.pnpm')
  const copies = (pattern) => fs.readdirSync(pnpmDir).filter((dir) => pattern.test(dir))
  const coreCopies = copies(/^(?:@valkyrianlabs\+)?payload-markdown@/)
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
    unresolved.length === 0 &&
      specifiers.some((s) => s.startsWith(`${coreName}/`)) &&
      specifiers.some((s) => s.startsWith(`${docsName}/`)),
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
