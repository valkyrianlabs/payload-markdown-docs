import { randomUUID } from 'node:crypto'
import {
  mkdir,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { assetRouteScaffoldFiles } from './assetRoutes.js'
import { isCliEntrypoint, runCli } from './index.js'

const originalCwd = process.cwd()
const tempRoots: string[] = []
const skillFiles = [
  'SKILL.md',
  'examples/docs-page.md',
  'examples/github-actions.md',
  'reference/admin.md',
  'reference/formatting.md',
  'reference/frontmatter.md',
  'reference/payload-markdown-directives.md',
  'reference/routing.md',
  'reference/sync.md',
  'reference/troubleshooting.md',
  'reference/workflow.md',
]
const assetRouteFiles = [
  ...assetRouteScaffoldFiles.map((file) => file.relativePath),
]

const createTempRoot = async (): Promise<string> => {
  const root = path.join(tmpdir(), `payload-markdown-docs-skill-${randomUUID()}`)
  await mkdir(root, {
    recursive: true,
  })
  tempRoots.push(root)

  return root
}

const readInstalledFile = (root: string, relativePath: string): Promise<string> =>
  readFile(path.join(root, relativePath), 'utf8')

const listFiles = async (root: string, basePath = ''): Promise<string[]> => {
  const entries = await readdir(path.join(root, basePath), {
    withFileTypes: true,
  })
  const files: string[] = []

  for (const entry of entries) {
    const relativePath = path.join(basePath, entry.name)

    if (entry.isDirectory()) {
      files.push(...(await listFiles(root, relativePath)))
      continue
    }

    if (entry.isFile()) {
      files.push(relativePath.split(path.sep).join('/'))
    }
  }

  return files.sort()
}

afterEach(async () => {
  process.chdir(originalCwd)
  await Promise.all(
    tempRoots.splice(0).map((root) =>
      rm(root, {
        force: true,
        recursive: true,
      }),
    ),
  )
})

describe('install skill command', () => {
  it('detects the CLI entrypoint through package-manager symlinks', async () => {
    const root = await createTempRoot()
    const realEntrypoint = path.join(root, 'store/package/dist/cli/index.js')
    const linkedEntrypoint = path.join(root, 'project/node_modules/.bin/payload-markdown-docs')

    await mkdir(path.dirname(realEntrypoint), {
      recursive: true,
    })
    await mkdir(path.dirname(linkedEntrypoint), {
      recursive: true,
    })
    await writeFile(realEntrypoint, '', 'utf8')
    await symlink(realEntrypoint, linkedEntrypoint)

    expect(
      isCliEntrypoint({
        argvPath: linkedEntrypoint,
        modulePath: realEntrypoint,
      }),
    ).toBe(true)
  })

  it('installs the Codex skill pack with --agent codex', async () => {
    const root = await createTempRoot()
    process.chdir(root)

    const result = await runCli(['install', 'skill', '--agent', 'codex'])

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('Agent: codex')
    expect(result.stdout).toContain('.agents/skills/payload-markdown-docs')
    expect(result.stdout).toContain('AGENTS.md')
    expect(await readInstalledFile(root, 'AGENTS.md')).toContain(
      '.agents/skills/payload-markdown-docs/SKILL.md',
    )
    expect(await listFiles(path.join(root, '.agents/skills/payload-markdown-docs'))).toEqual(
      skillFiles,
    )
  })

  it('installs the Codex skill pack with --codex', async () => {
    const root = await createTempRoot()
    process.chdir(root)

    const result = await runCli(['install', 'skill', '--codex'])

    expect(result.exitCode).toBe(0)
    expect(await listFiles(path.join(root, '.agents/skills/payload-markdown-docs'))).toEqual(
      skillFiles,
    )
    expect(await readInstalledFile(root, 'AGENTS.md')).toContain(
      '.agents/skills/payload-markdown-docs/SKILL.md',
    )
  })

  it('installs the Claude skill pack with --agent claude without changing AGENTS.md', async () => {
    const root = await createTempRoot()
    process.chdir(root)

    const result = await runCli(['install', 'skill', '--agent', 'claude'])

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('Agent: claude')
    expect(result.stdout).toContain('.claude/skills/payload-markdown-docs')
    expect(result.stdout).not.toContain('AGENTS.md')
    expect(await listFiles(path.join(root, '.claude/skills/payload-markdown-docs'))).toEqual(
      skillFiles,
    )
    await expect(readInstalledFile(root, 'AGENTS.md')).rejects.toThrow()
  })

  it('installs the Claude skill pack with --claude', async () => {
    const root = await createTempRoot()
    process.chdir(root)

    const result = await runCli(['install', 'skill', '--claude'])

    expect(result.exitCode).toBe(0)
    expect(await listFiles(path.join(root, '.claude/skills/payload-markdown-docs'))).toEqual(
      skillFiles,
    )
    await expect(readInstalledFile(root, 'AGENTS.md')).rejects.toThrow()
  })

  it('supports the ai-skill alias for both agents', async () => {
    const root = await createTempRoot()
    const codexOut = path.join(root, 'codex-skill')
    const claudeOut = path.join(root, 'claude-skill')

    const codex = await runCli([
      'install',
      'ai-skill',
      '--agent',
      'codex',
      '--out',
      codexOut,
    ])
    const claude = await runCli([
      'install',
      'ai-skill',
      '--agent',
      'claude',
      '--out',
      claudeOut,
    ])

    expect(codex.exitCode).toBe(0)
    expect(claude.exitCode).toBe(0)
    expect(await readInstalledFile(codexOut, 'SKILL.md')).toContain('Use this skill in Codex')
    expect(await readInstalledFile(claudeOut, 'SKILL.md')).toContain('Use this skill in Claude')
  })

  it('merges Codex skill instructions into an existing AGENTS.md', async () => {
    const root = await createTempRoot()
    process.chdir(root)
    await writeFile(path.join(root, 'AGENTS.md'), '# Agents\n\nKeep this existing note.\n', 'utf8')

    const result = await runCli(['install', 'skill', '--codex'])
    const agents = await readInstalledFile(root, 'AGENTS.md')

    expect(result.exitCode).toBe(0)
    expect(agents).toContain('Keep this existing note.')
    expect(agents).toContain('Payload Markdown Docs Skill')
    expect(agents).toContain('.agents/skills/payload-markdown-docs/SKILL.md')
  })

  it('supports custom output and template substitutions', async () => {
    const root = await createTempRoot()
    const out = path.join(root, 'agent-skill')

    const result = await runCli([
      'install',
      'skill',
      '--codex',
      '--out',
      out,
      '--docs-root',
      './content/docs',
      '--package-manager',
      'npm',
    ])
    const skill = await readInstalledFile(out, 'SKILL.md')

    expect(result.exitCode).toBe(0)
    expect(skill).toContain('npm exec payload-markdown-docs validate --source main-docs')
    expect(skill).toContain('npm exec payload-markdown-docs plan --source main-docs')
    expect(skill).toContain('--docs ./content/docs')
    expect(skill).toContain('npm exec payload-markdown-docs push \\')
    expect(skill).not.toContain('payload-markdown-docs push ./content/docs')
    expect(skill).toContain('`--sync` is a compatibility flag')
    expect(skill).not.toContain('./content/docs/index.ai.yml')
    await expect(readInstalledFile(root, 'AGENTS.md')).rejects.toThrow()
  })

  it('repairs Codex discovery when skill files already exist unchanged', async () => {
    const root = await createTempRoot()
    const out = path.join(root, '.agents/skills/payload-markdown-docs')
    process.chdir(root)

    const first = await runCli(['install', 'skill', '--codex', '--out', out])
    const second = await runCli(['install', 'skill', '--codex', '--out', out])

    expect(first.exitCode).toBe(0)
    expect(second.exitCode).toBe(0)
    await expect(readInstalledFile(root, 'AGENTS.md')).rejects.toThrow()

    const defaultInstall = await runCli(['install', 'skill', '--codex'])

    expect(defaultInstall.exitCode).toBe(0)
    expect(await readInstalledFile(root, 'AGENTS.md')).toContain(
      '.agents/skills/payload-markdown-docs/SKILL.md',
    )
  })

  it('installs skill guidance that forbids deprecated AI artifact files', async () => {
    const root = await createTempRoot()
    const out = path.join(root, 'skill')

    const result = await runCli(['install', 'skill', '--codex', '--out', out])
    const skill = await readInstalledFile(out, 'SKILL.md')

    expect(result.exitCode).toBe(0)
    expect(skill).toContain('Do not create `index.ai.yml`.')
    expect(skill).toContain('Do not create `index.ai.yaml`.')
    expect(skill).toContain('Do not create a single consolidated AI Markdown export file.')
    expect(skill).not.toContain('output: /plugins/payload-markdown.md')
    expect(skill.match(/index\.ai\.yml/g)).toHaveLength(1)
  })

  it('refuses overwrites unless forced', async () => {
    const root = await createTempRoot()
    const out = path.join(root, 'skill')
    const first = await runCli(['install', 'skill', '--codex', '--out', out])
    await writeFile(path.join(out, 'SKILL.md'), 'stale\n', 'utf8')
    const second = await runCli(['install', 'skill', '--codex', '--out', out])
    const forced = await runCli([
      'install',
      'skill',
      '--codex',
      '--out',
      out,
      '--force',
    ])

    expect(first.exitCode).toBe(0)
    expect(second.exitCode).toBe(1)
    expect(second.stderr).toContain('Skill files already exist')
    expect(forced.exitCode).toBe(0)
    expect(await readInstalledFile(out, 'SKILL.md')).not.toBe('stale\n')
  })

  it('supports dry-run without writing files', async () => {
    const root = await createTempRoot()
    const out = path.join(root, 'skill')

    const result = await runCli([
      'install',
      'skill',
      '--codex',
      '--out',
      out,
      '--dry-run',
    ])

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('dry-run')
    expect(result.stdout).toContain('SKILL.md')
    await expect(readdir(out)).rejects.toThrow()
  })

  it('installs public Next asset route files', async () => {
    const root = await createTempRoot()
    const payloadApp = path.join(root, 'src/app/(payload)')
    await mkdir(payloadApp, {
      recursive: true,
    })
    process.chdir(root)

    const result = await runCli(['install', 'routes'])

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('/llms.txt')
    expect(result.stdout).toContain('/plugins/<docs-set-slug>/skills/<agent>')
    expect(result.stdout).toContain('IMPORTANT:')
    expect(result.stdout).toContain('These files must be committed')
    expect(await listFiles(payloadApp)).toEqual([...assetRouteFiles].sort())

    const sharedRoute = await readInstalledFile(
      root,
      'src/app/(payload)/payloadMarkdownDocsAssetRoute.ts',
    )
    const rootRoute = await readInstalledFile(root, 'src/app/(payload)/llms.txt/route.ts')
    const nestedRoute = await readInstalledFile(
      root,
      'src/app/(payload)/plugins/[docsSetSlug]/skills/[agent]/[[...assetPath]]/route.ts',
    )

    expect(sharedRoute).toContain("import config from '@payload-config'")
    expect(sharedRoute).toContain('createPayloadMarkdownDocsAssetRouteHandler')
    expect(sharedRoute).toContain("@valkyrianlabs/payload-markdown-docs/next")
    expect(sharedRoute).not.toContain('../../../dist/next')
    expect(rootRoute).toContain("export { GET } from '../payloadMarkdownDocsAssetRoute'")
    expect(rootRoute).toContain("dynamic = 'force-dynamic'")
    expect(nestedRoute).toContain(
      "export { GET } from '../../../../../payloadMarkdownDocsAssetRoute'",
    )

    const unchanged = await runCli(['install', 'asset-routes'])

    expect(unchanged.exitCode).toBe(0)
  })

  it('supports asset route dry-run, explicit app path, and force overwrites', async () => {
    const root = await createTempRoot()
    const payloadApp = path.join(root, 'app/(payload)')
    await mkdir(payloadApp, {
      recursive: true,
    })
    process.chdir(root)

    const dryRun = await runCli([
      'install',
      'ai-routes',
      '--payload-app',
      payloadApp,
      '--dry-run',
    ])

    expect(dryRun.exitCode).toBe(0)
    expect(dryRun.stdout).toContain('dry-run')
    await expect(readInstalledFile(root, 'app/(payload)/llms.txt/route.ts')).rejects.toThrow()

    const first = await runCli(['install', 'routes', '--payload-app', payloadApp])
    await writeFile(path.join(payloadApp, 'llms.txt/route.ts'), 'stale\n', 'utf8')
    const second = await runCli(['install', 'routes', '--payload-app', payloadApp])
    const forced = await runCli([
      'install',
      'routes',
      '--payload-app',
      payloadApp,
      '--force',
    ])

    expect(first.exitCode).toBe(0)
    expect(second.exitCode).toBe(1)
    expect(second.stderr).toContain('Asset route files already exist')
    expect(forced.exitCode).toBe(0)
    expect(await readInstalledFile(root, 'app/(payload)/llms.txt/route.ts')).not.toBe('stale\n')
  })

  it('requires a Payload app route group for asset route installs', async () => {
    const root = await createTempRoot()
    process.chdir(root)

    const implicit = await runCli(['install', 'routes'])
    const explicit = await runCli([
      'install',
      'routes',
      '--payload-app',
      path.join(root, 'missing/(payload)'),
    ])

    expect(implicit.exitCode).toBe(1)
    expect(implicit.stderr).toContain('Could not find a Payload app route group')
    expect(explicit.exitCode).toBe(1)
    expect(explicit.stderr).toContain('Payload app route group does not exist')
  })

  it('keeps the dev harness route shape aligned with the consuming-app scaffold', async () => {
    const devPayloadApp = path.resolve('dev/app/(payload)')
    const devFiles = await listFiles(devPayloadApp)

    expect(devFiles.filter((file) => assetRouteFiles.includes(file))).toEqual(
      [...assetRouteFiles].sort(),
    )

    const devSharedRoute = await readFile(
      path.join(devPayloadApp, 'payloadMarkdownDocsAssetRoute.ts'),
      'utf8',
    )
    const scaffoldSharedRoute = assetRouteScaffoldFiles.find(
      (file) => file.relativePath === 'payloadMarkdownDocsAssetRoute.ts',
    )?.content

    expect(devSharedRoute).toContain('../../../dist/next')
    expect(scaffoldSharedRoute).toContain('@valkyrianlabs/payload-markdown-docs/next')
  })

  it('does not write bundled skill files outside the target directory', async () => {
    const root = await createTempRoot()
    const out = path.join(root, 'skill')

    const result = await runCli(['install', 'skill', '--codex', '--out', out])
    const files = await listFiles(root)

    expect(result.exitCode).toBe(0)
    expect(files.every((file) => file.startsWith('skill/'))).toBe(true)
  })

  it('installs references and example files', async () => {
    const root = await createTempRoot()
    const out = path.join(root, 'skill')

    const result = await runCli(['install', 'skill', '--codex', '--out', out])
    const directives = await readInstalledFile(
      out,
      'reference/payload-markdown-directives.md',
    )
    const frontmatter = await readInstalledFile(out, 'reference/frontmatter.md')
    const formatting = await readInstalledFile(out, 'reference/formatting.md')
    const example = await readInstalledFile(out, 'examples/docs-page.md')

    expect(result.exitCode).toBe(0)
    for (const directive of [':::toc', ':::callout', ':::details', ':::steps', ':::cards', ':::card']) {
      expect(directives).toContain(directive)
    }
    for (const field of [
      'title',
      'navTitle',
      'description',
      'order',
      'status',
      'slug',
      'tags',
      'redirectFrom',
      'draft',
    ]) {
      expect(frontmatter).toContain(`\`${field}\``)
    }
    expect(formatting).toContain('plain Markdown')
    expect(formatting).toContain('Do not add')
    expect(example).toContain('# Example Docs Page')
  })

  it('detects package manager from lockfiles', async () => {
    const root = await createTempRoot()
    process.chdir(root)
    await writeFile(path.join(root, 'yarn.lock'), '', 'utf8')

    const result = await runCli(['install', 'skill', '--codex'])
    const skill = await readInstalledFile(
      root,
      '.agents/skills/payload-markdown-docs/SKILL.md',
    )

    expect(result.exitCode).toBe(0)
    expect(skill).toContain('yarn exec payload-markdown-docs validate --source main-docs')
  })

  it('validates target, agent, package manager, and help behavior', async () => {
    const missingAgent = await runCli(['install', 'skill'])
    const badAgent = await runCli(['install', 'skill', '--agent', 'cursor'])
    const multipleAgents = await runCli(['install', 'skill', '--codex', '--claude'])
    const badTarget = await runCli(['install', 'plugin', '--codex'])
    const badPackageManager = await runCli([
      'install',
      'skill',
      '--codex',
      '--package-manager',
      'cargo',
    ])
    const help = await runCli(['install', 'skill', '--help'])

    expect(missingAgent.exitCode).toBe(1)
    expect(missingAgent.stderr).toContain('--agent codex|claude')
    expect(badAgent.exitCode).toBe(1)
    expect(badAgent.stderr).toContain('codex or claude')
    expect(multipleAgents.exitCode).toBe(1)
    expect(multipleAgents.stderr).toContain('one agent target')
    expect(badTarget.exitCode).toBe(1)
    expect(badTarget.stderr).toContain('target "skill", "ai-skill", "routes"')
    expect(badPackageManager.exitCode).toBe(1)
    expect(badPackageManager.stderr).toContain('pnpm, npm, yarn, or bun')
    expect(help.exitCode).toBe(0)
    expect(help.stdout).toContain('payload-markdown-docs install skill --agent codex')
    expect(help.stdout).toContain('--claude')
    expect(help.stdout).toContain('payload-markdown-docs install routes')
  })
})
