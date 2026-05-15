import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { CliResult, ParsedCliArgs } from '../types.js'

import { assetRouteScaffoldFiles, payloadAppDirCandidates } from '../assetRoutes.js'
import { getFlagBoolean, getFlagString } from '../parseArgs.js'

type AgentTarget = 'claude' | 'codex'

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

type InstallAssetRoutesOptions = {
  dryRun: boolean
  force: boolean
  payloadAppDir: string
}

const packageManagers = new Set<PackageManager>(['bun', 'npm', 'pnpm', 'yarn'])
const supportedInstallTargets = new Set(['ai-routes', 'ai-skill', 'asset-routes', 'routes', 'skill'])
const supportedAgents = new Set<AgentTarget>(['claude', 'codex'])
const defaultSkillOutputPaths: Record<AgentTarget, string> = {
  claude: '.claude/skills/payload-markdown-docs',
  codex: '.agents/skills/payload-markdown-docs',
}
const agentsFilePath = 'AGENTS.md'

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

const detectPayloadAppDir = async (): Promise<string | undefined> => {
  for (const candidate of payloadAppDirCandidates) {
    if (await fileExists(candidate)) {
      return candidate
    }
  }

  return undefined
}

const getSkillTemplateRoot = async (agent: AgentTarget): Promise<URL> => {
  const candidates = [
    new URL(`../../skills/payload-markdown-docs/${agent}/`, import.meta.url),
    new URL(`../../../skills/payload-markdown-docs/${agent}/`, import.meta.url),
  ]

  for (const candidate of candidates) {
    if (await fileExists(candidate.pathname)) {
      return candidate
    }
  }

  return candidates[0]
}

const readTemplateFiles = async (
  directoryUrl: URL,
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
  agent,
  content,
  docsRoot,
  packageManager,
}: {
  agent: AgentTarget
  content: string
  docsRoot: string
  packageManager: PackageManager
}): string =>
  content
    .replaceAll('{{agent}}', agent)
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
  agent,
  docsRoot,
  outDir,
  packageManager,
}: Pick<InstallSkillOptions, 'agent' | 'docsRoot' | 'outDir' | 'packageManager'>): Promise<
  CliResult | PlannedSkillFile[]
> => {
  const absoluteOutDir = path.resolve(outDir)
  const templates = await readTemplateFiles(await getSkillTemplateRoot(agent))
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
        agent,
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
  const defaultSkillOutputPath = defaultSkillOutputPaths.codex
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

const getInstallAssetRoutesOptions = async (
  args: ParsedCliArgs,
): Promise<CliResult | InstallAssetRoutesOptions> => {
  const payloadAppDirFlag = getFlagString(args, 'payload-app') ?? getFlagString(args, 'app')
  const detectedPayloadAppDir = payloadAppDirFlag ?? (await detectPayloadAppDir())

  if (!detectedPayloadAppDir) {
    return {
      exitCode: 1,
      stderr:
        'Could not find a Payload app route group. Pass --payload-app "src/app/(payload)" or --payload-app "app/(payload)".\n',
    }
  }

  if (payloadAppDirFlag && !(await fileExists(payloadAppDirFlag))) {
    return {
      exitCode: 1,
      stderr: `Payload app route group does not exist: ${payloadAppDirFlag}\n`,
    }
  }

  return {
    dryRun: getFlagBoolean(args, 'dry-run'),
    force: getFlagBoolean(args, 'force'),
    payloadAppDir: detectedPayloadAppDir,
  }
}

const getInstallSkillOptions = async (
  args: ParsedCliArgs,
): Promise<CliResult | InstallSkillOptions> => {
  const [target] = args.positionals

  if (!target || !supportedInstallTargets.has(target)) {
    return {
      exitCode: 1,
      stderr:
        'Install requires target "skill", "ai-skill", "routes", "asset-routes", or "ai-routes".\n',
    }
  }

  const agentFlag = getFlagString(args, 'agent')
  const codex = getFlagBoolean(args, 'codex')
  const claude = getFlagBoolean(args, 'claude')

  if (agentFlag !== undefined && !supportedAgents.has(agentFlag as AgentTarget)) {
    return {
      exitCode: 1,
      stderr: '--agent must be codex or claude.\n',
    }
  }

  const requestedAgents = [
    ...(agentFlag ? [agentFlag as AgentTarget] : []),
    ...(codex ? (['codex'] as const) : []),
    ...(claude ? (['claude'] as const) : []),
  ]
  const uniqueRequestedAgents = [...new Set(requestedAgents)]

  if (uniqueRequestedAgents.length === 0) {
    return {
      exitCode: 1,
      stderr: 'Install skill requires --codex, --claude, or --agent codex|claude.\n',
    }
  }

  if (uniqueRequestedAgents.length > 1) {
    return {
      exitCode: 1,
      stderr: 'Install skill accepts one agent target at a time.\n',
    }
  }

  const [agent] = uniqueRequestedAgents
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
    agent,
    docsRoot: getFlagString(args, 'docs-root') ?? './docs',
    dryRun: getFlagBoolean(args, 'dry-run'),
    force: getFlagBoolean(args, 'force'),
    outDir: outDirFlag ?? defaultSkillOutputPaths[agent],
    packageManager:
      (packageManagerFlag as PackageManager | undefined) ?? (await detectPackageManager()),
    updateAgentsFile: agent === 'codex' && outDirFlag === undefined,
  }
}

const createAssetRoutePlan = ({
  payloadAppDir,
}: Pick<InstallAssetRoutesOptions, 'payloadAppDir'>): PlannedInstallFile[] => {
  const absolutePayloadAppDir = path.resolve(payloadAppDir)

  return assetRouteScaffoldFiles.map((file) => ({
    content: file.content,
    path: path.join(absolutePayloadAppDir, file.relativePath),
    relativePath: path.posix.join(payloadAppDir.replaceAll(path.sep, '/'), file.relativePath),
  }))
}

const formatInstalledAssetRoutes = ({
  dryRun,
  files,
  payloadAppDir,
}: {
  dryRun: boolean
  files: PlannedInstallFile[]
  payloadAppDir: string
}): string => {
  const lines = [
    dryRun
      ? 'payload-markdown-docs install routes dry-run'
      : 'payload-markdown-docs install routes',
    '',
    `Payload app route group: ${path.resolve(payloadAppDir)}`,
    'Files:',
    ...files.map((file) => `- ${file.relativePath}`),
    '',
    'Routes:',
    '- /llms.txt',
    '- /llms-full.txt',
    '- /plugins/<docs-set-slug>/llms.txt',
    '- /plugins/<docs-set-slug>/llms-full.txt',
    '- /plugins/<docs-set-slug>/skills/<agent>',
    '- /plugins/<docs-set-slug>/skills/<agent>/SKILL.md',
    '',
    'IMPORTANT:',
    'These files must be committed to your Next app repository.',
    'Payload config endpoints alone cannot create public Next filesystem routes.',
    'If you deploy without these files, /llms.txt and /skills routes will 404.',
  ]

  return `${lines.join('\n')}\n`
}

const formatPlannedFiles = ({
  agent,
  dryRun,
  files,
  outDir,
}: {
  agent: AgentTarget
  dryRun: boolean
  files: PlannedInstallFile[]
  outDir: string
}): string => {
  const lines = [
    dryRun
      ? 'payload-markdown-docs install skill dry-run'
      : 'payload-markdown-docs install skill',
    '',
    `Agent: ${agent}`,
    `Target: ${path.resolve(outDir)}`,
    'Files:',
    ...files.map((file) => `- ${file.relativePath}`),
  ]

  return `${lines.join('\n')}\n`
}

export const runInstallCommand = async (
  args: ParsedCliArgs,
): Promise<CliResult> => {
  const [target] = args.positionals

  if (target === 'routes' || target === 'asset-routes' || target === 'ai-routes') {
    const options = await getInstallAssetRoutesOptions(args)

    if ('exitCode' in options) {
      return options
    }

    const plannedFiles = createAssetRoutePlan(options)

    if (!options.force) {
      const existingFiles: string[] = []

      for (const file of plannedFiles) {
        if (await fileExists(file.path)) {
          const existingContent = await readFile(file.path, 'utf8')

          if (existingContent !== file.content) {
            existingFiles.push(file.relativePath)
          }
        }
      }

      if (existingFiles.length > 0) {
        return {
          exitCode: 1,
          stderr: `Asset route files already exist with different content. Use --force to overwrite:\n${existingFiles
            .map((file) => `- ${file}`)
            .join('\n')}\n`,
        }
      }
    }

    if (options.dryRun) {
      return {
        exitCode: 0,
        stdout: formatInstalledAssetRoutes({
          dryRun: true,
          files: plannedFiles,
          payloadAppDir: options.payloadAppDir,
        }),
      }
    }

    for (const file of plannedFiles) {
      await mkdir(path.dirname(file.path), {
        recursive: true,
      })
      await writeFile(file.path, file.content, 'utf8')
    }

    return {
      exitCode: 0,
      stdout: formatInstalledAssetRoutes({
        dryRun: false,
        files: plannedFiles,
        payloadAppDir: options.payloadAppDir,
      }),
    }
  }

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
        const existingContent = await readFile(file.path, 'utf8')

        if (existingContent !== file.content) {
          existingFiles.push(file.relativePath)
        }
      }
    }

    if (existingFiles.length > 0) {
      return {
        exitCode: 1,
        stderr: `Skill files already exist with different content. Use --force to overwrite:\n${existingFiles
          .map((file) => `- ${file}`)
          .join('\n')}\n`,
      }
    }
  }

  if (options.dryRun) {
    return {
      exitCode: 0,
      stdout: formatPlannedFiles({
        agent: options.agent,
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
      agent: options.agent,
      dryRun: false,
      files: plannedInstallFiles,
      outDir: options.outDir,
    }),
  }
}
