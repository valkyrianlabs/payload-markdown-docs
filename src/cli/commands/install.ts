import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { CliResult, ParsedCliArgs } from '../types.js'

import { getFlagBoolean, getFlagString } from '../parseArgs.js'

type AgentTarget = 'codex'

type PackageManager = 'bun' | 'npm' | 'pnpm' | 'yarn'

type SkillTemplateFile = {
  content: string
  relativePath: string
}

type PlannedSkillFile = {
  content: string
  path: string
  relativePath: string
}

type PlannedInstallFile = PlannedSkillFile

type InstallSkillOptions = {
  agent: AgentTarget
  docsRoot: string
  dryRun: boolean
  force: boolean
  outDir: string
  packageManager: PackageManager
  updateAgentsFile: boolean
}

const packageManagers = new Set<PackageManager>(['bun', 'npm', 'pnpm', 'yarn'])
const supportedInstallTargets = new Set(['ai-skill', 'skill'])
const defaultSkillOutputPath = '.agents/skills/payload-markdown-docs'
const agentsFilePath = 'AGENTS.md'

const skillTemplateRoot = new URL('../../skills/codex/', import.meta.url)

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath)

    return true
  } catch {
    return false
  }
}

const detectPackageManager = async (cwd = process.cwd()): Promise<PackageManager> => {
  const lockfiles: [file: string, packageManager: PackageManager][] = [
    ['pnpm-lock.yaml', 'pnpm'],
    ['package-lock.json', 'npm'],
    ['yarn.lock', 'yarn'],
    ['bun.lockb', 'bun'],
  ]

  for (const [file, packageManager] of lockfiles) {
    if (await fileExists(path.join(cwd, file))) {
      return packageManager
    }
  }

  return 'pnpm'
}

const readTemplateFiles = async (
  directoryUrl = skillTemplateRoot,
  basePath = '',
): Promise<SkillTemplateFile[]> => {
  const entries = await readdir(directoryUrl, {
    withFileTypes: true,
  })
  const files: SkillTemplateFile[] = []

  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      continue
    }

    const relativePath = path.posix.join(basePath, entry.name)
    const entryUrl = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directoryUrl)

    if (entry.isDirectory()) {
      files.push(...(await readTemplateFiles(entryUrl, relativePath)))
      continue
    }

    if (!entry.isFile()) {
      continue
    }

    files.push({
      content: await readFile(entryUrl, 'utf8'),
      relativePath,
    })
  }

  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath))
}

const applyTemplateValues = ({
  content,
  docsRoot,
  packageManager,
}: {
  content: string
  docsRoot: string
  packageManager: PackageManager
}): string =>
  content
    .replaceAll('{{docsRoot}}', docsRoot)
    .replaceAll('{{packageManager}}', packageManager)

const assertSafeRelativePath = (relativePath: string): CliResult | undefined => {
  const normalized = path.posix.normalize(relativePath)

  if (
    normalized.startsWith('../') ||
    normalized === '..' ||
    path.isAbsolute(relativePath) ||
    relativePath.includes('\\')
  ) {
    return {
      exitCode: 1,
      stderr: `Unsafe bundled skill path "${relativePath}".\n`,
    }
  }

  return undefined
}

const createPlannedFiles = async ({
  docsRoot,
  outDir,
  packageManager,
}: Pick<InstallSkillOptions, 'docsRoot' | 'outDir' | 'packageManager'>): Promise<
  CliResult | PlannedSkillFile[]
> => {
  const absoluteOutDir = path.resolve(outDir)
  const templates = await readTemplateFiles()
  const plannedFiles: PlannedSkillFile[] = []

  for (const template of templates) {
    const unsafe = assertSafeRelativePath(template.relativePath)

    if (unsafe) {
      return unsafe
    }

    const outputPath = path.resolve(absoluteOutDir, template.relativePath)

    if (
      outputPath !== absoluteOutDir &&
      !outputPath.startsWith(`${absoluteOutDir}${path.sep}`)
    ) {
      return {
        exitCode: 1,
        stderr: `Refusing to write outside target directory: ${template.relativePath}\n`,
      }
    }

    plannedFiles.push({
      content: applyTemplateValues({
        content: template.content,
        docsRoot,
        packageManager,
      }),
      path: outputPath,
      relativePath: template.relativePath,
    })
  }

  return plannedFiles
}

const createAgentsFilePlan = async (): Promise<PlannedInstallFile | undefined> => {
  const absoluteAgentsPath = path.resolve(agentsFilePath)
  const skillPath = `${defaultSkillOutputPath}/SKILL.md`
  const skillSection = [
    '## Payload Markdown Docs Skill',
    '',
    `This project uses the Payload Markdown Docs skill at \`${defaultSkillOutputPath}/\`.`,
    `Start with \`${skillPath}\` when maintaining Git-backed Markdown docs.`,
  ].join('\n')

  if (!(await fileExists(absoluteAgentsPath))) {
    return {
      content: `# Agents\n\n${skillSection}\n`,
      path: absoluteAgentsPath,
      relativePath: agentsFilePath,
    }
  }

  const currentContent = await readFile(absoluteAgentsPath, 'utf8')

  if (
    currentContent.includes(skillPath) ||
    currentContent.includes(defaultSkillOutputPath)
  ) {
    return undefined
  }

  const separator = currentContent.endsWith('\n') ? '\n' : '\n\n'

  return {
    content: `${currentContent}${separator}${skillSection}\n`,
    path: absoluteAgentsPath,
    relativePath: agentsFilePath,
  }
}

const getInstallSkillOptions = async (
  args: ParsedCliArgs,
): Promise<CliResult | InstallSkillOptions> => {
  const [target] = args.positionals

  if (!target || !supportedInstallTargets.has(target)) {
    return {
      exitCode: 1,
      stderr: 'Install requires target "skill" or "ai-skill".\n',
    }
  }

  const agentFlag = getFlagString(args, 'agent')
  const codex = getFlagBoolean(args, 'codex')

  if (agentFlag && agentFlag !== 'codex') {
    return {
      exitCode: 1,
      stderr: '--agent currently supports only "codex".\n',
    }
  }

  if (!codex && agentFlag !== 'codex') {
    return {
      exitCode: 1,
      stderr: 'Install skill requires --codex or --agent codex.\n',
    }
  }

  const outDirFlag = getFlagString(args, 'out')
  const packageManagerFlag = getFlagString(args, 'package-manager')

  if (
    packageManagerFlag !== undefined &&
    !packageManagers.has(packageManagerFlag as PackageManager)
  ) {
    return {
      exitCode: 1,
      stderr: '--package-manager must be pnpm, npm, yarn, or bun.\n',
    }
  }

  return {
    agent: 'codex',
    docsRoot: getFlagString(args, 'docs-root') ?? './docs',
    dryRun: getFlagBoolean(args, 'dry-run'),
    force: getFlagBoolean(args, 'force'),
    outDir: outDirFlag ?? defaultSkillOutputPath,
    packageManager:
      (packageManagerFlag as PackageManager | undefined) ?? (await detectPackageManager()),
    updateAgentsFile: outDirFlag === undefined,
  }
}

const formatPlannedFiles = ({
  dryRun,
  files,
  outDir,
}: {
  dryRun: boolean
  files: PlannedInstallFile[]
  outDir: string
}): string => {
  const lines = [
    dryRun
      ? 'payload-markdown-docs install skill dry-run'
      : 'payload-markdown-docs install skill',
    '',
    `Target: ${path.resolve(outDir)}`,
    'Files:',
    ...files.map((file) => `- ${file.relativePath}`),
  ]

  return `${lines.join('\n')}\n`
}

export const runInstallCommand = async (
  args: ParsedCliArgs,
): Promise<CliResult> => {
  const options = await getInstallSkillOptions(args)

  if ('exitCode' in options) {
    return options
  }

  const plannedFiles = await createPlannedFiles(options)

  if ('exitCode' in plannedFiles) {
    return plannedFiles
  }

  const agentsFile = options.updateAgentsFile ? await createAgentsFilePlan() : undefined
  const plannedInstallFiles = agentsFile ? [...plannedFiles, agentsFile] : plannedFiles

  if (!options.force) {
    const existingFiles: string[] = []

    for (const file of plannedFiles) {
      if (await fileExists(file.path)) {
        existingFiles.push(file.relativePath)
      }
    }

    if (existingFiles.length > 0) {
      return {
        exitCode: 1,
        stderr: `Skill files already exist. Use --force to overwrite:\n${existingFiles
          .map((file) => `- ${file}`)
          .join('\n')}\n`,
      }
    }
  }

  if (options.dryRun) {
    return {
      exitCode: 0,
      stdout: formatPlannedFiles({
        dryRun: true,
        files: plannedInstallFiles,
        outDir: options.outDir,
      }),
    }
  }

  for (const file of plannedFiles) {
    await mkdir(path.dirname(file.path), {
      recursive: true,
    })
    await writeFile(file.path, file.content, 'utf8')
  }

  if (agentsFile) {
    await writeFile(agentsFile.path, agentsFile.content, 'utf8')
  }

  return {
    exitCode: 0,
    stdout: formatPlannedFiles({
      dryRun: false,
      files: plannedInstallFiles,
      outDir: options.outDir,
    }),
  }
}
