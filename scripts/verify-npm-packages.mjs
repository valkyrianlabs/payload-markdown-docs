#!/usr/bin/env node
/**
 * Verifies the two npm distributions of this package, @valkyrianlabs/payload-markdown-docs and its
 * `[[npm.aliases]]` name payload-markdown-docs, the way consumers install them.
 *
 *   node scripts/verify-npm-packages.mjs [--release <dir>]   tarballs vlr built (default: release/)
 *   node scripts/verify-npm-packages.mjs --pack              rehearsal: pack dist/ now (run `pnpm build`
 *                                                            first) and derive the alias like vlr does
 *
 * Also verifies the separately built consumer package (`[[npm.packages]]`, packages/consumer),
 * under both of its names: it declares no dependencies and imports in plain Node from a directory outside this repository,
 * so nothing (Payload, Next.js, React) can resolve from here.
 *
 * Checks, failing with a non-zero exit:
 * - both tarballs hold the same files with the same bytes and modes, except package.json (only
 *   `name` differs) and the alias's `rewrite` members (only the package name differs);
 * - every subpath export imports from both names in plain Node (except ./next, which imports
 *   Next.js internals that only resolve under Next's bundler), and the plugin's admin component
 *   paths use the installed name;
 * - the types of every subpath resolve from both names (tsc, `bundler` and `nodenext`).
 *
 * Packages are unpacked into build/npm-verify/node_modules; their dependencies (payload,
 * payload-markdown, react, ...) resolve from this repository's node_modules.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const work = path.join(root, 'build/npm-verify')
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const canonical = manifest.name
const version = manifest.version
const alias = readAlias()
const consumerDir = path.join(root, 'packages/consumer')
const consumerName = JSON.parse(fs.readFileSync(path.join(consumerDir, 'package.json'), 'utf8')).name
const consumerAlias = fs
  .readFileSync(path.join(root, 'release.toml'), 'utf8')
  .match(/\[\[npm\.packages\.aliases\]\]\s*\nname\s*=\s*"([^"]+)"/)?.[1]

const failures = []
const ok = (message) => console.log(`ok   ${message}`)
const fail = (message) => {
  failures.push(message)
  console.log(`FAIL ${message}`)
}

/** The `[[npm.aliases]]` entry of release.toml (name and rewrite members). */
function readAlias() {
  const toml = fs.readFileSync(path.join(root, 'release.toml'), 'utf8')
  const match = toml.match(/\[\[npm\.aliases\]\]\s*\nname\s*=\s*"([^"]+)"\s*\nrewrite\s*=\s*\[([^\]]*)\]/)
  if (!match) throw new Error('release.toml has no [[npm.aliases]] entry with name and rewrite')

  return { name: match[1], rewrite: [...match[2].matchAll(/"([^"]+)"/g)].map((m) => m[1]) }
}

/** npm's pack file name: `@scope/pkg` 1.2.3 -> `scope-pkg-1.2.3.tgz` (as vlr names it too). */
const tarballName = (name) => `${name.replace(/^@/, '').replace('/', '-')}-${version}.tgz`

const run = (command, args, options = {}) =>
  execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options })

/** Same rename as vlr: only the top-level `"name"`, formatting untouched. */
function renameManifest(text) {
  const pattern = new RegExp(`("name"\\s*:\\s*)${JSON.stringify(canonical).replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}`, 'g')
  const count = text.match(pattern)?.length ?? 0
  if (count !== 1) throw new Error(`expected exactly one "name": "${canonical}" in package.json, found ${count}`)

  return text.replace(pattern, (_match, prefix) => `${prefix}${JSON.stringify(alias.name)}`)
}

/** Rehearsal: pack the built package and derive the alias tarball like `vlr build-npm`. */
function packLocally(dir) {
  if (!fs.existsSync(path.join(root, 'dist/index.js'))) throw new Error('dist/ is missing; run `pnpm build` first')

  fs.rmSync(dir, { force: true, recursive: true })
  fs.mkdirSync(dir, { recursive: true })
  run('npm', ['pack', '--ignore-scripts', '--pack-destination', dir], { cwd: root })

  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'pmdocs-alias-'))
  run('tar', ['-xzf', path.join(dir, tarballName(canonical)), '-C', stage])
  const pkg = path.join(stage, 'package')
  fs.writeFileSync(path.join(pkg, 'package.json'), renameManifest(fs.readFileSync(path.join(pkg, 'package.json'), 'utf8')))

  for (const member of alias.rewrite) {
    const file = path.join(stage, member)
    const text = fs.readFileSync(file, 'utf8')
    if (!text.includes(canonical)) throw new Error(`${member} does not contain ${canonical}`)
    fs.writeFileSync(file, text.split(canonical).join(alias.name))
  }

  run('npm', ['pack', '--ignore-scripts', '--pack-destination', dir], { cwd: pkg })
  fs.rmSync(stage, { force: true, recursive: true })

  if (!fs.existsSync(path.join(consumerDir, 'dist/index.js'))) {
    throw new Error('packages/consumer/dist is missing; run `pnpm --filter ./packages/consumer build` first')
  }
  run('npm', ['pack', '--ignore-scripts', '--pack-destination', dir], { cwd: consumerDir })

  if (consumerAlias) {
    // Like vlr: the same files, only package.json "name" differs.
    const consumerStage = fs.mkdtempSync(path.join(os.tmpdir(), 'pmdocs-consumer-alias-'))
    run('tar', ['-xzf', path.join(dir, tarballName(consumerName)), '-C', consumerStage])
    const manifestPath = path.join(consumerStage, 'package', 'package.json')
    const text = fs.readFileSync(manifestPath, 'utf8')
    fs.writeFileSync(manifestPath, text.replace(`"name": ${JSON.stringify(consumerName)}`, `"name": ${JSON.stringify(consumerAlias)}`))
    run('npm', ['pack', '--ignore-scripts', '--pack-destination', dir], { cwd: path.join(consumerStage, 'package') })
    fs.rmSync(consumerStage, { force: true, recursive: true })
  }

  return dir
}

/** The consumer package must stand alone: no dependencies, importable with nothing else installed. */
function verifyConsumer(tarball, consumerName) {
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'pmdocs-consumer-'))

  try {
    const target = path.join(stage, 'node_modules', consumerName)
    fs.mkdirSync(target, { recursive: true })
    run('tar', ['-xzf', tarball, '-C', target, '--strip-components=1'])
    fs.writeFileSync(path.join(stage, 'package.json'), '{ "name": "consumer-verify", "private": true, "type": "module" }\n')
    summarize(consumerName, tarball, target)

    const pkg = JSON.parse(fs.readFileSync(path.join(target, 'package.json'), 'utf8'))
    const declared = ['dependencies', 'peerDependencies', 'optionalDependencies'].filter(
      (key) => Object.keys(pkg[key] ?? {}).length > 0,
    )
    if (declared.length > 0) fail(`${consumerName} declares ${declared.join(', ')}`)
    else ok(`${consumerName} declares no dependencies`)
    if (pkg.version !== version) fail(`${consumerName} is ${pkg.version}, the plugin is ${version}`)
    else ok(`${consumerName} is version-aligned (${version})`)

    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `const m = await import(${JSON.stringify(consumerName)}); if (typeof m.createDocsProjectsClient !== 'function' || m.DOCS_PROJECTS_SCHEMA_VERSION !== 1) process.exit(1)`,
      ],
      { cwd: stage, encoding: 'utf8' },
    )
    if (result.status === 0) ok(`${consumerName} imports in plain Node with nothing else installed`)
    else fail(`${consumerName} does not import standalone: ${(result.stderr || result.stdout).trim()}`)
  } finally {
    fs.rmSync(stage, { force: true, recursive: true })
  }
}

/** Every file under `dir` (POSIX paths, sorted). */
function listFiles(dir, prefix = '') {
  return fs
    .readdirSync(path.join(dir, prefix), { withFileTypes: true })
    .flatMap((entry) => {
      const child = prefix ? `${prefix}/${entry.name}` : entry.name
      return entry.isDirectory() ? listFiles(dir, child) : [child]
    })
    .sort()
}

function unpack(tarball, name) {
  const target = path.join(work, 'node_modules', name)
  fs.rmSync(target, { force: true, recursive: true })
  fs.mkdirSync(target, { recursive: true })
  run('tar', ['-xzf', tarball, '-C', target, '--strip-components=1'])

  return target
}

function summarize(name, tarball, dir) {
  const files = listFiles(dir)
  const unpacked = files.reduce((total, file) => total + fs.statSync(path.join(dir, file)).size, 0)
  const integrity = `sha512-${createHash('sha512').update(fs.readFileSync(tarball)).digest('base64')}`

  console.log(`\n  ${name}@${version}  ${path.relative(root, tarball)}`)
  console.log(`    files: ${files.length}  unpacked: ${(unpacked / 1024).toFixed(1)} kB  packed: ${(fs.statSync(tarball).size / 1024).toFixed(1)} kB`)
  console.log(`    integrity: ${integrity}`)
}

function compare(canonicalDir, aliasDir) {
  const left = listFiles(canonicalDir)
  const right = listFiles(aliasDir)

  if (left.join('\n') !== right.join('\n')) {
    const extra = right.filter((file) => !left.includes(file))
    const missing = left.filter((file) => !right.includes(file))
    fail(`file lists differ (alias extra: ${extra.join(', ') || 'none'}; missing: ${missing.join(', ') || 'none'})`)
    return
  }

  const rewrite = new Set(alias.rewrite.map((member) => member.replace(/^package\//, '')))
  let differing = 0

  for (const file of left) {
    const a = fs.readFileSync(path.join(canonicalDir, file))
    const b = fs.readFileSync(path.join(aliasDir, file))
    const modeA = fs.statSync(path.join(canonicalDir, file)).mode & 0o777
    const modeB = fs.statSync(path.join(aliasDir, file)).mode & 0o777

    if (modeA !== modeB) fail(`${file}: mode ${modeB.toString(8)} differs from ${modeA.toString(8)}`)

    if (file === 'package.json') {
      const expected = { ...JSON.parse(a.toString('utf8')), name: alias.name }
      if (JSON.stringify(JSON.parse(b.toString('utf8'))) !== JSON.stringify(expected))
        fail('package.json differs in more than "name"')
      differing++
    } else if (rewrite.has(file)) {
      if (b.toString('utf8') !== a.toString('utf8').split(canonical).join(alias.name))
        fail(`${file} differs in more than the package name`)
      differing++
    } else if (!a.equals(b)) {
      fail(`${file} differs between the packages`)
    }
  }

  ok(`${left.length} files; identical except package.json name and ${[...rewrite].join(', ')} (${differing} renamed)`)
}

/** Subpath exports and one runtime symbol each (types are checked for the same symbols). */
const SUBPATH_SYMBOLS = Object.fromEntries(
  Object.keys(manifest.exports).map((subpath) => [
    subpath.replace(/^\./, ''),
    {
      '.': 'payloadMarkdownDocs',
      './admin': 'DocsSetManager',
      './blocks': 'DocsCTABlock',
      './fields': 'docsHeroField',
      './mcp': 'withPayloadMarkdownDocsMcp',
      './migrations': 'prepareDocsSyncMigration',
      './next': 'PayloadMarkdownDocsPage',
    }[subpath],
  ]),
)

const SMOKE = `
const name = process.env.PMDOCS_SMOKE_PACKAGE
const symbols = JSON.parse(process.env.PMDOCS_SMOKE_SYMBOLS)
let checks = 0
for (const [subpath, symbol] of Object.entries(symbols)) {
  if (subpath === '/next') continue
  const mod = await import(name + subpath)
  if (!symbol || mod[symbol] === undefined) throw new Error(name + subpath + ' does not export ' + symbol)
  checks++
}
const { payloadMarkdownDocs } = await import(name)
const config = payloadMarkdownDocs()({ collections: [], plugins: [] })
const paths = JSON.stringify(config).match(/"[^"]*\\/admin#DocsSetManager"/g) ?? []
if (paths.length === 0 || paths.some((p) => p !== JSON.stringify(name + '/admin#DocsSetManager')))
  throw new Error('admin component paths ' + paths.join(', ') + ' do not use ' + name)
checks++
console.log('ok ' + checks)
`

function smoke(name) {
  fs.writeFileSync(path.join(work, 'smoke.mjs'), SMOKE)
  const result = spawnSync(
    process.execPath,
    // Some dependencies import CSS as a side effect; Node cannot load it (same hook as the tests).
    ['--import', pathToFileURL(path.join(root, 'vitest.css-loader.js')).href, path.join(work, 'smoke.mjs')],
    {
      cwd: work,
      encoding: 'utf8',
      env: { ...process.env, PMDOCS_SMOKE_PACKAGE: name, PMDOCS_SMOKE_SYMBOLS: JSON.stringify(SUBPATH_SYMBOLS) },
    },
  )

  if (result.status === 0) ok(`exports and admin component paths from ${name} (${result.stdout.trim().split(' ').pop()} checks)`)
  else fail(`exports smoke from ${name}:\n${result.stdout}${result.stderr}`)
}

function checkTypes(names) {
  const lines = ['type IsAny<T> = 0 extends 1 & T ? true : false', '']

  names.forEach((name, index) => {
    for (const [subpath, symbol] of Object.entries(SUBPATH_SYMBOLS)) {
      const local = `${symbol}${index}`
      lines.push(
        `import { ${symbol} as ${local} } from '${name}${subpath}'`,
        `export const ${local}Typed: IsAny<typeof ${local}> = false`,
      )
    }
  })
  fs.writeFileSync(path.join(work, 'types.ts'), `${lines.join('\n')}\n`)

  for (const [module, moduleResolution] of [
    ['esnext', 'bundler'],
    ['nodenext', 'nodenext'],
  ]) {
    const config = {
      compilerOptions: { jsx: 'react-jsx', module, moduleResolution, noEmit: true, skipLibCheck: true, strict: true, target: 'es2022', types: [] },
      files: ['types.ts'],
    }
    fs.writeFileSync(path.join(work, 'tsconfig.json'), JSON.stringify(config, null, 2))
    const result = spawnSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '-p', work], { encoding: 'utf8' })

    if (result.status === 0) ok(`types of ${Object.keys(SUBPATH_SYMBOLS).length} subpaths from ${names.join(' and ')} (${moduleResolution})`)
    else fail(`types (${moduleResolution}):\n${result.stdout}${result.stderr}`)
  }
}

const args = process.argv.slice(2)
const releaseIndex = args.indexOf('--release')
const source = args.includes('--pack')
  ? packLocally(path.join(root, 'build/npm-packages'))
  : path.resolve(root, releaseIndex >= 0 && args[releaseIndex + 1] ? args[releaseIndex + 1] : 'release')
const names = [canonical, alias.name]
const tarballs = names.map((name) => path.join(source, tarballName(name)))

for (const tarball of tarballs) if (!fs.existsSync(tarball)) throw new Error(`missing ${tarball} (run \`vlr build-npm\` or use --pack)`)

fs.rmSync(work, { force: true, recursive: true })
fs.mkdirSync(work, { recursive: true })
// Its own package scope, so the scoped name cannot self-resolve to this repository.
fs.writeFileSync(path.join(work, 'package.json'), '{ "name": "npm-verify", "private": true, "type": "module" }\n')

const dirs = names.map((name, index) => unpack(tarballs[index], name))

console.log(`npm packages (${args.includes('--pack') ? 'rehearsal pack' : path.relative(root, source)}):`)
names.forEach((name, index) => summarize(name, tarballs[index], dirs[index]))
console.log('')

compare(dirs[0], dirs[1])
names.forEach((name) => smoke(name))
checkTypes(names)

for (const name of [consumerName, consumerAlias].filter(Boolean)) {
  const consumerTarball = path.join(source, tarballName(name))
  if (fs.existsSync(consumerTarball)) verifyConsumer(consumerTarball, name)
  else fail(`missing ${path.relative(root, consumerTarball)} (run \`vlr build-npm\` or use --pack)`)
}

if (failures.length > 0) {
  console.log(`\n${failures.length} package verification failure(s)`)
  process.exit(1)
}
