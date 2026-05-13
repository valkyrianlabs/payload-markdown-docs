#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '../../..')
const nativeBin = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(repoRoot, 'build', 'cli', 'pmdocs')

const baseEnv = {
  ...process.env,
  GITHUB_REPOSITORY: '',
}

const run = (name, command, args) => {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    env: baseEnv,
  })

  if (result.error) {
    throw new Error(`${name} failed to start: ${result.error.message}`)
  }

  return {
    status: result.status ?? 1,
    stderr: result.stderr,
    stdout: result.stdout,
  }
}

const runNative = (args) => run('native pmdocs', nativeBin, args)
const runNpm = (args) => run('npm CLI', 'pnpm', ['--silent', 'cli', ...args])

const parseJsonOutput = (label, result) => {
  try {
    return JSON.parse(result.stdout)
  } catch (error) {
    throw new Error(`${label} did not print JSON stdout.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}\n${error.message}`)
  }
}

const compareJsonCommand = (label, args, { expectedStatus } = {}) => {
  const nativeResult = runNative(args)
  const npmResult = runNpm(args)
  const expectedNativeStatus = expectedStatus ?? npmResult.status

  assert.equal(
    nativeResult.status,
    expectedNativeStatus,
    `${label}: native exit status differed\nstdout:\n${nativeResult.stdout}\nstderr:\n${nativeResult.stderr}`,
  )
  assert.equal(
    nativeResult.status,
    npmResult.status,
    `${label}: native and npm exit statuses differed\nnative stderr:\n${nativeResult.stderr}\nnpm stderr:\n${npmResult.stderr}`,
  )

  const nativeJson = parseJsonOutput(`${label} native`, nativeResult)
  const npmJson = parseJsonOutput(`${label} npm`, npmResult)

  assert.deepStrictEqual(nativeJson, npmJson, `${label}: JSON output differed`)
}

const write = (filePath, content) => {
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, content)
}

const makeTempRoot = (name) => mkdtempSync(path.join(tmpdir(), `pmdocs-parity-${name}-`))

const withTempRoot = (name, callback) => {
  const root = makeTempRoot(name)

  try {
    callback(root)
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
}

const makeBasicDocs = (root) => {
  const docs = path.join(root, 'docs')
  write(path.join(docs, 'index.md'), '# Home\n')
  write(
    path.join(docs, 'guides', 'intro.md'),
    [
      '---',
      'title: Intro',
      'description: Getting started',
      'order: 20',
      'tags:',
      '  - guide',
      '  - intro',
      '---',
      '# Intro',
      '',
    ].join('\n'),
  )

  return docs
}

const compareStandardCommands = (label, docsRoot) => {
  const sourceArgs = [docsRoot, '--source', 'main-docs']

  compareJsonCommand(`${label}: validate`, [
    'validate',
    ...sourceArgs,
    '--json',
    '--pretty',
  ])
  compareJsonCommand(`${label}: manifest`, [
    'manifest',
    ...sourceArgs,
    '--pretty',
  ])
  compareJsonCommand(`${label}: plan`, [
    'plan',
    ...sourceArgs,
    '--json',
    '--pretty',
  ])
}

compareJsonCommand('repo fixture: validate', [
  'validate',
  'dev/docs-fixtures/basic',
  '--source',
  'payload-markdown-docs',
  '--json',
  '--pretty',
])
compareJsonCommand('repo fixture: manifest', [
  'manifest',
  'dev/docs-fixtures/basic',
  '--source',
  'payload-markdown-docs',
  '--pretty',
])
compareJsonCommand('repo fixture: plan', [
  'plan',
  'dev/docs-fixtures/basic',
  '--source',
  'payload-markdown-docs',
  '--json',
  '--pretty',
])

withTempRoot('basic', (root) => {
  compareStandardCommands('generated basic docs', makeBasicDocs(root))
})

withTempRoot('frontmatter', (root) => {
  const docs = path.join(root, 'docs')
  write(path.join(docs, 'index.md'), '# Home\n')
  write(
    path.join(docs, 'bad.md'),
    [
      '---',
      'title: Bad',
      'order: nope',
      'unknown: value',
      '---',
      '# Bad',
      '',
    ].join('\n'),
  )

  compareJsonCommand(
    'invalid frontmatter: validate',
    ['validate', docs, '--source', 'main-docs', '--json', '--pretty'],
    { expectedStatus: 1 },
  )
})

withTempRoot('ai-export', (root) => {
  const docs = path.join(root, 'docs')
  write(path.join(docs, 'index.md'), '# Home\n')
  write(path.join(docs, 'guides', 'intro.md'), '# Intro\n')
  write(
    path.join(docs, 'index.ai.yml'),
    [
      'version: 1',
      'title: Payload Markdown Documentation',
      'canonical: /plugins/payload-markdown',
      'output: /plugins/payload-markdown.md',
      'preamble: |',
      '  This file is intended for AI agents.',
      'order:',
      '  - ./index.md',
      '  - ./missing.md',
      'orphans: append',
      'headingMode: normalize',
      '',
    ].join('\n'),
  )

  compareJsonCommand('AI export warning: validate', [
    'validate',
    docs,
    '--source',
    'main-docs',
    '--json',
    '--pretty',
  ])
  compareJsonCommand('AI export warning does not leak into plan warnings', [
    'plan',
    docs,
    '--source',
    'main-docs',
    '--json',
    '--pretty',
  ])
})

withTempRoot('limits', (root) => {
  const docs = makeBasicDocs(root)

  compareJsonCommand(
    'max files limit: validate',
    [
      'validate',
      docs,
      '--source',
      'main-docs',
      '--max-files',
      '1',
      '--json',
      '--pretty',
    ],
    { expectedStatus: 1 },
  )
})

withTempRoot('existing', (root) => {
  const docs = makeBasicDocs(root)
  const existingPath = path.join(root, 'existing.json')

  write(
    existingPath,
    JSON.stringify(
      [
        {
          route: '/main-docs',
          sourceHash: 'old-hash',
          sourcePath: 'index.md',
          title: 'Home',
        },
        {
          route: '/main-docs/old',
          sourceHash: 'old-hash',
          sourcePath: 'old.md',
          title: 'Old',
        },
        {
          route: '/main-docs/duplicate-a',
          sourceHash: 'old-hash',
          sourcePath: 'duplicate.md',
          title: 'Duplicate A',
        },
        {
          route: '/main-docs/duplicate-b',
          sourceHash: 'old-hash',
          sourcePath: 'duplicate.md',
          title: 'Duplicate B',
        },
      ],
      null,
      2,
    ),
  )

  compareJsonCommand('existing records: plan archive', [
    'plan',
    docs,
    '--source',
    'main-docs',
    '--existing',
    existingPath,
    '--json',
    '--pretty',
  ])
  compareJsonCommand('existing records: plan ignore', [
    'plan',
    docs,
    '--source',
    'main-docs',
    '--existing',
    existingPath,
    '--delete-behavior',
    'ignore',
    '--json',
    '--pretty',
  ])
})

console.log('Phase 2 native/npm parity checks passed.')
