import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import packageJson from '../package.json' with { type: 'json' }

const read = (file: string) => fs.readFileSync(file, 'utf8')
const containerfile = read('ci/Containerfile')
const lockfile = read('pnpm-lock.yaml')
const releaseToml = read('release.toml')
const releaseWorkflow = read('.github/workflows/release.yml')
const CANONICAL = '@valkyrianlabs/payload-markdown-docs'

/** One job's block of a workflow file (from its key to the next job key). */
const job = (workflow: string, name: string) => {
  const start = workflow.indexOf(`\n  ${name}:\n`)
  expect(start, `job ${name}`).toBeGreaterThan(-1)
  const rest = workflow.slice(start + 1)
  const next = rest.slice(1).search(/\n {2}[a-z][\w-]*:\n/)

  return next === -1 ? rest : rest.slice(0, next + 1)
}

const listFiles = (dir: string): string[] =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => (entry.isDirectory() ? listFiles(path.join(dir, entry.name)) : [path.join(dir, entry.name)]))

describe('CI container (ci/)', () => {
  it('matches the Playwright, Node and pnpm versions the project uses', () => {
    const playwright = lockfile.match(/^ {2}playwright@(\d+\.\d+\.\d+):$/m)?.[1]
    const nvmrc = read('.nvmrc').trim()

    expect(playwright).toBeDefined()
    expect(containerfile).toMatch(
      new RegExp(`^FROM mcr\\.microsoft\\.com/playwright:v${playwright}-noble@sha256:[0-9a-f]{64}$`, 'm'),
    )
    expect(containerfile.match(/^ARG NODE_VERSION=(\S+)$/m)?.[1]).toMatch(new RegExp(`^${nvmrc}(\\.|$)`))
    expect(`pnpm@${containerfile.match(/^ARG PNPM_VERSION=(\S+)$/m)?.[1]}`).toBe(packageJson.packageManager)
  })

  it('carries vl-release and the GitHub CLI for release jobs', () => {
    expect(containerfile).toMatch(/apt-get install -y --no-install-recommends gh vl-release/)
  })
})

describe('release (vl-release)', () => {
  it('publishes the same build under both npm names', () => {
    expect(releaseToml).toMatch(
      /\[\[npm\.aliases\]\]\s*\nname = "payload-markdown-docs"\s*\nrewrite = \["package\/dist\/package\.js"\]/,
    )
    expect(packageJson.name).toBe(CANONICAL)
    expect(packageJson).not.toHaveProperty('bin')
    expect(releaseToml).toMatch(/\[\[publish\.npm\]\][^[]*auth = "oidc"/)
  })

  it('keeps the package name in src/package.ts only, which the npm alias rewrites', () => {
    expect(read('src/package.ts').split(CANONICAL)).toHaveLength(2)

    const offenders = listFiles('src').filter(
      (file) =>
        /\.tsx?$/.test(file) &&
        !/\.spec\.tsx?$/.test(file) &&
        file !== path.join('src', 'package.ts') &&
        read(file).includes(CANONICAL),
    )

    expect(offenders).toEqual([])
  })

  it.skipIf(!fs.existsSync('dist/package.js'))('builds no other reference to the scoped name', () => {
    expect(read('dist/package.js').split(CANONICAL)).toHaveLength(2)
    expect(read('dist/package.d.ts')).not.toContain(CANONICAL)

    const offenders = listFiles('dist').filter(
      (file) => /\.(?:js|d\.ts)$/.test(file) && file !== path.join('dist', 'package.js') && read(file).includes(CANONICAL),
    )

    expect(offenders).toEqual([])
  })

  it('builds and validates every artifact once, in the build job', () => {
    const build = job(releaseWorkflow, 'build')

    for (const command of [
      'vlr check --release --tag',
      'vlr prepare --record release/meta/prepare.json',
      'vlr build-npm',
      'node scripts/verify-npm-packages.mjs --release release',
      'node scripts/sync-payload-markdown-skill.mjs --check',
      'vlr build-deb',
      'vlr source-archive',
      'vlr homebrew formula',
      'vlr validate-artifacts',
      'vlr publish-npm --mode enabled --dry-run',
    ]) {
      expect(build).toContain(command)
    }

    // `vlr build-deb` empties release/: every other artifact must be built after it.
    for (const later of ['vlr build-npm', 'vlr source-archive', 'vlr homebrew formula']) {
      expect(build.indexOf('vlr build-deb')).toBeLessThan(build.indexOf(later))
    }

    // The Homebrew parity build uses only the source archive, outside any node_modules.
    expect(build).toMatch(/tar -xzf "release\/pmdocs-\$\{VERSION\}\.tar\.gz"/)
    expect(build).toMatch(/grep -F 'payload-markdown\/SKILL\.md'/)
    expect(build).toMatch(/--image docker\.io\/library\/ubuntu:24\.04@sha256:[0-9a-f]{64} --root/)
  })

  it('publishes on the right runners, in a safe order', () => {
    const npm = job(releaseWorkflow, 'publish-npm')

    expect(npm).toMatch(/runs-on: ubuntu-latest/)
    expect(npm).toMatch(/id-token: write/)
    expect(npm).toMatch(/needs: \[build, publish-debian\]/)
    expect(npm).toContain('vlr publish-npm --require-enabled')
    expect(releaseWorkflow).not.toContain('NPM_TOKEN')

    expect(job(releaseWorkflow, 'publish-debian')).toContain('vlr publish-deb --require-enabled')
    expect(job(releaseWorkflow, 'publish-homebrew')).toMatch(/needs: \[build, github-release\]/)
    expect(job(releaseWorkflow, 'finalize')).toContain('vlr finalize --record release/meta/prepare.json')

    for (const name of ['build', 'publish-debian', 'github-release', 'publish-homebrew', 'publish-docs', 'finalize']) {
      expect(job(releaseWorkflow, name)).toContain('runs-on: [self-hosted, Linux, X64, ubuntu-latest-lts]')
    }
  })

  it('grants write permissions only where needed', () => {
    expect(releaseWorkflow).toMatch(/^permissions:\n {2}contents: read\n/m)

    const writers = ['build', 'publish-debian', 'publish-npm', 'github-release', 'publish-homebrew', 'publish-docs', 'finalize'].filter(
      (name) => /contents: write/.test(job(releaseWorkflow, name)),
    )

    expect(writers).toEqual(['github-release', 'finalize'])
  })
})
