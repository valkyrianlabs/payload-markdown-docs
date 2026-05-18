import { joinRouteSegments, normalizeRoutePath } from './routing/index.js'

export type SkillBundleAsset = {
  content?: string
  contentType?: string
  id?: number | string
  kind?: string
  route?: string
  sourceId?: string
  sourcePath?: string
}

export type SkillSourceInfo = {
  agent: string
  relativePath: string
  sourceId: string
}

export type SkillRouteInfo = {
  agent: string
  relativePath: string
}

export type SkillBundleFile = {
  agent: string
  content?: string
  contentType?: string
  id?: string
  relativePath: string
  route: string
  sourceId?: string
  sourcePath: string
}

export type SkillBundle = {
  agent: string
  archiveRoute: string
  files: SkillBundleFile[]
  packageSlug: string
  root: SkillBundleFile
  rootRoute: string
  skillRoute: string
  title: string
}

export type SkillDirectoryEntry = {
  name: string
  path: string
  route: string
  type: 'directory' | 'file'
}

const rootSkillFilename = 'SKILL.md'

const getString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined

const normalizeRelativePath = (value: string): string | undefined => {
  const trimmed = value.trim()

  if (!trimmed || trimmed.startsWith('/') || /^[a-z]:[\\/]/i.test(trimmed)) {
    return undefined
  }

  const segments = trimmed.replace(/\\/g, '/').replace(/\/+/g, '/').split('/')

  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    return undefined
  }

  return segments.join('/')
}

export const sanitizeSkillPath = normalizeRelativePath

export const sanitizeSkillPackageSlug = (value: string): string | undefined => {
  const sanitized = value
    .trim()
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '')

  if (!sanitized || sanitized === '.' || sanitized === '..') {
    return undefined
  }

  return sanitized
}

export const formatSkillAgentTitle = (agent: string): string =>
  agent
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((segment) => `${segment.charAt(0).toUpperCase()}${segment.slice(1)}`)
    .join(' ')

export const formatSkillPackageTitle = (packageSlug: string): string =>
  packageSlug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((segment) => `${segment.charAt(0).toUpperCase()}${segment.slice(1)}`)
    .join(' ')

export const parseSkillSourcePath = (sourcePath: string): SkillSourceInfo | undefined => {
  const normalizedSourcePath = normalizeRelativePath(sourcePath)

  if (!normalizedSourcePath) {
    return undefined
  }

  const [root, sourceId, agent, ...fileSegments] = normalizedSourcePath.split('/')

  if (root !== 'skills' || !sourceId || !agent || fileSegments.length === 0) {
    return undefined
  }

  return {
    agent,
    relativePath: fileSegments.join('/'),
    sourceId,
  }
}

export const parseSkillRoute = (route: string): SkillRouteInfo | undefined => {
  const segments = normalizeRoutePath(route).split('/').filter(Boolean)
  const skillsIndex = segments.lastIndexOf('skills')
  const agent = skillsIndex >= 0 ? segments[skillsIndex + 1] : undefined
  const fileSegments = skillsIndex >= 0 ? segments.slice(skillsIndex + 2) : []

  if (
    !agent ||
    agent === '.' ||
    agent === '..' ||
    fileSegments.length === 0 ||
    fileSegments.some((segment) => segment === '' || segment === '.' || segment === '..')
  ) {
    return undefined
  }

  return {
    agent,
    relativePath: fileSegments.join('/'),
  }
}

export const getSkillRootRouteFromSkillRoute = (skillRoute: string): string => {
  const normalizedRoute = normalizeRoutePath(skillRoute)
  const suffix = `/${rootSkillFilename}`

  return normalizedRoute.endsWith(suffix)
    ? normalizedRoute.slice(0, -suffix.length) || '/'
    : normalizedRoute
}

export const getSkillAssetSourceInfo = (
  asset: SkillBundleAsset,
): SkillSourceInfo | undefined => {
  const sourcePath = getString(asset.sourcePath)

  return sourcePath ? parseSkillSourcePath(sourcePath) : undefined
}

export const getSkillAssetRouteInfo = (asset: SkillBundleAsset): SkillRouteInfo | undefined => {
  const route = getString(asset.route)

  return route ? parseSkillRoute(route) : undefined
}

export const getSkillAssetAgent = (asset: SkillBundleAsset): string | undefined =>
  getSkillAssetSourceInfo(asset)?.agent ?? getSkillAssetRouteInfo(asset)?.agent

export const getSkillAssetRelativePath = (asset: SkillBundleAsset): string | undefined =>
  getSkillAssetSourceInfo(asset)?.relativePath ?? getSkillAssetRouteInfo(asset)?.relativePath

export const isRootSkillAsset = (asset: SkillBundleAsset): boolean =>
  getSkillAssetRelativePath(asset) === rootSkillFilename

export const toSkillBundleFile = (asset: SkillBundleAsset): SkillBundleFile | undefined => {
  if (asset.kind !== undefined && asset.kind !== 'skill') {
    return undefined
  }

  const route = getString(asset.route)
  const sourcePath = getString(asset.sourcePath)

  if (!route || !sourcePath) {
    return undefined
  }

  const sourceInfo = parseSkillSourcePath(sourcePath)
  const routeInfo = parseSkillRoute(route)
  const agent = sourceInfo?.agent ?? routeInfo?.agent
  const relativePath = sourceInfo?.relativePath ?? routeInfo?.relativePath

  if (!agent || !relativePath) {
    return undefined
  }

  return {
    id: asset.id === undefined ? undefined : String(asset.id),
    agent,
    content: asset.content,
    contentType: asset.contentType,
    relativePath,
    route: normalizeRoutePath(route),
    sourceId: sourceInfo?.sourceId ?? getString(asset.sourceId),
    sourcePath,
  }
}

const compareSkillBundleFiles = (first: SkillBundleFile, second: SkillBundleFile): number => {
  if (first.relativePath === rootSkillFilename) {
    return -1
  }

  if (second.relativePath === rootSkillFilename) {
    return 1
  }

  return first.relativePath.localeCompare(second.relativePath)
}

const dedupeSkillBundleFiles = (files: SkillBundleFile[]): SkillBundleFile[] => {
  const filesByPath = new Map<string, SkillBundleFile>()

  for (const file of files) {
    if (!filesByPath.has(file.relativePath)) {
      filesByPath.set(file.relativePath, file)
    }
  }

  return [...filesByPath.values()].sort(compareSkillBundleFiles)
}

export const getSkillBundles = (assets: SkillBundleAsset[]): SkillBundle[] => {
  const filesByAgent = new Map<string, SkillBundleFile[]>()

  for (const asset of assets) {
    const file = toSkillBundleFile(asset)

    if (!file) {
      continue
    }

    filesByAgent.set(file.agent, [...(filesByAgent.get(file.agent) ?? []), file])
  }

  return [...filesByAgent.entries()]
    .flatMap(([agent, files]) => {
      const sortedFiles = dedupeSkillBundleFiles(files)
      const root = sortedFiles.find((file) => file.relativePath === rootSkillFilename)

      if (!root) {
        return []
      }

      const rootRoute = getSkillRootRouteFromSkillRoute(root.route)
      const packageSlug = root.sourceId ?? sanitizeSkillPackageSlug(agent) ?? agent

      return [
        {
          agent,
          archiveRoute: `${rootRoute}.zip`,
          files: sortedFiles,
          packageSlug,
          root,
          rootRoute,
          skillRoute: root.route,
          title: `${formatSkillAgentTitle(agent)} skill`,
        },
      ]
    })
    .sort((first, second) => first.agent.localeCompare(second.agent))
}

export const getSkillBundleForAgent = (
  assets: SkillBundleAsset[],
  agent: string,
): SkillBundle | undefined => getSkillBundles(assets).find((bundle) => bundle.agent === agent)

export const getSkillZipEntryPath = ({
  packageSlug,
  relativePath,
}: {
  packageSlug: string
  relativePath: string
}): string | undefined => {
  const safePackageSlug = sanitizeSkillPackageSlug(packageSlug)
  const safeRelativePath = normalizeRelativePath(relativePath)

  if (!safePackageSlug || !safeRelativePath) {
    return undefined
  }

  return `${safePackageSlug}/${safeRelativePath}`
}

export const getSkillDirectoryRoute = ({
  directoryPath,
  rootRoute,
}: {
  directoryPath?: string
  rootRoute: string
}): string => {
  const normalizedDirectoryPath = directoryPath ? normalizeRelativePath(directoryPath) : undefined

  return normalizedDirectoryPath
    ? joinRouteSegments(rootRoute, normalizedDirectoryPath)
    : normalizeRoutePath(rootRoute)
}

const getDirectoryPrefix = (directoryPath?: string): string | undefined => {
  const normalizedDirectoryPath = directoryPath ? normalizeRelativePath(directoryPath) : undefined

  return normalizedDirectoryPath ? `${normalizedDirectoryPath}/` : undefined
}

export const hasSkillDirectory = ({
  bundle,
  directoryPath,
}: {
  bundle: SkillBundle
  directoryPath?: string
}): boolean => {
  const normalizedDirectoryPath = directoryPath ? normalizeRelativePath(directoryPath) : undefined

  if (directoryPath && !normalizedDirectoryPath) {
    return false
  }

  if (!normalizedDirectoryPath) {
    return true
  }

  const prefix = `${normalizedDirectoryPath}/`

  return bundle.files.some((file) => file.relativePath.startsWith(prefix))
}

export const getSkillDirectoryEntries = ({
  bundle,
  directoryPath,
}: {
  bundle: SkillBundle
  directoryPath?: string
}): SkillDirectoryEntry[] => {
  const prefix = getDirectoryPrefix(directoryPath)
  const entriesByPath = new Map<string, SkillDirectoryEntry>()

  for (const file of bundle.files) {
    if (prefix && !file.relativePath.startsWith(prefix)) {
      continue
    }

    const remainingPath = prefix ? file.relativePath.slice(prefix.length) : file.relativePath
    const [name, ...rest] = remainingPath.split('/')

    if (!name) {
      continue
    }

    if (rest.length === 0) {
      entriesByPath.set(file.relativePath, {
        name,
        type: 'file',
        path: file.relativePath,
        route: file.route,
      })

      continue
    }

    const directoryRelativePath = prefix ? `${prefix}${name}` : name

    entriesByPath.set(directoryRelativePath, {
      name,
      type: 'directory',
      path: directoryRelativePath,
      route: getSkillDirectoryRoute({
        directoryPath: directoryRelativePath,
        rootRoute: bundle.rootRoute,
      }),
    })
  }

  return [...entriesByPath.values()].sort(
    (first, second) =>
      first.type.localeCompare(second.type) || first.path.localeCompare(second.path),
  )
}

const renderSkillTree = (files: SkillBundleFile[]): string[] => {
  const lines: string[] = []
  const sortedPaths = files.map((file) => file.relativePath).sort((first, second) => {
    if (first === rootSkillFilename) {
      return -1
    }

    if (second === rootSkillFilename) {
      return 1
    }

    return first.localeCompare(second)
  })
  const renderedDirectories = new Set<string>()

  for (const relativePath of sortedPaths) {
    const segments = relativePath.split('/')

    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index]
      const directoryPath = segments.slice(0, index + 1).join('/')
      const isFile = index === segments.length - 1
      const indent = '  '.repeat(index)

      if (!segment) {
        continue
      }

      if (!isFile) {
        if (renderedDirectories.has(directoryPath)) {
          continue
        }

        renderedDirectories.add(directoryPath)
        lines.push(`${indent}- ${segment}/`)
        continue
      }

      lines.push(`${indent}- ${segment}`)
    }
  }

  return lines
}

export const renderSkillDirectoryIndex = ({
  bundle,
  directoryPath,
}: {
  bundle: SkillBundle
  directoryPath?: string
}): string | undefined => {
  const normalizedDirectoryPath = directoryPath ? normalizeRelativePath(directoryPath) : undefined

  if (directoryPath && !normalizedDirectoryPath) {
    return undefined
  }

  if (!hasSkillDirectory({ bundle, directoryPath: normalizedDirectoryPath })) {
    return undefined
  }

  const isRoot = !normalizedDirectoryPath
  const entries = getSkillDirectoryEntries({
    bundle,
    directoryPath: normalizedDirectoryPath,
  })
  const directories = entries.filter((entry) => entry.type === 'directory')
  const files = isRoot
    ? bundle.files
    : entries.filter((entry) => entry.type === 'file')
  const lines = [
    isRoot
      ? `# ${formatSkillAgentTitle(bundle.agent)} Skill: ${formatSkillPackageTitle(bundle.packageSlug)}`
      : `# ${formatSkillAgentTitle(bundle.agent)} Skill: /${normalizedDirectoryPath}`,
    '',
  ]

  if (!isRoot) {
    const parentPath = normalizedDirectoryPath.split('/').slice(0, -1).join('/')

    lines.push(
      'Parent:',
      `- ${getSkillDirectoryRoute({
        directoryPath: parentPath || undefined,
        rootRoute: bundle.rootRoute,
      })}`,
      '',
    )
  }

  lines.push('Installable archive:', `- ${bundle.archiveRoute}`, '')
  lines.push('Entry file:', `- ${bundle.skillRoute}`, '')

  if (directories.length > 0) {
    lines.push('Directories:', ...directories.map((entry) => `- ${entry.route}`), '')
  }

  if (files.length > 0) {
    lines.push(
      'Files:',
      ...files.map((file) => `- ${file.route}`),
      '',
    )
  }

  if (isRoot) {
    lines.push('Tree:', ...renderSkillTree(bundle.files), '')
  }

  return `${lines.join('\n').replace(/\n+$/g, '')}\n`
}
