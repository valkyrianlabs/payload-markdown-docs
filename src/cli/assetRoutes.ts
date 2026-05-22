import { access } from 'node:fs/promises'
import path from 'node:path'

export const payloadAppDirCandidates = ['src/app/(payload)', 'app/(payload)', 'dev/app/(payload)']

export type AssetRouteScaffoldFile = {
  content: string
  relativePath: string
}

export const sharedAssetRouteFile = 'payloadMarkdownDocsAssetRoute.ts'

export const assetRouteScaffoldFiles: AssetRouteScaffoldFile[] = [
  {
    content: `import config from '@payload-config'
import { createPayloadMarkdownDocsAssetRouteHandler } from '@valkyrianlabs/payload-markdown-docs/next'

export const GET = createPayloadMarkdownDocsAssetRouteHandler({
  config,
})
`,
    relativePath: sharedAssetRouteFile,
  },
  {
    content: `export { GET } from '../payloadMarkdownDocsAssetRoute'

export const dynamic = 'force-dynamic'
`,
    relativePath: 'llms.txt/route.ts',
  },
  {
    content: `export { GET } from '../payloadMarkdownDocsAssetRoute'

export const dynamic = 'force-dynamic'
`,
    relativePath: 'llms-full.txt/route.ts',
  },
  {
    content: `export { GET } from '../../../payloadMarkdownDocsAssetRoute'

export const dynamic = 'force-dynamic'
`,
    relativePath: 'plugins/[docsSetSlug]/llms.txt/route.ts',
  },
  {
    content: `export { GET } from '../../../payloadMarkdownDocsAssetRoute'

export const dynamic = 'force-dynamic'
`,
    relativePath: 'plugins/[docsSetSlug]/llms-full.txt/route.ts',
  },
  {
    content: `export { GET } from '../../../../../payloadMarkdownDocsAssetRoute'

export const dynamic = 'force-dynamic'
`,
    relativePath: 'plugins/[docsSetSlug]/skills/[agent]/[[...assetPath]]/route.ts',
  },
  {
    content: `export { GET } from '../../payloadMarkdownDocsAssetRoute'

export const dynamic = 'force-dynamic'
`,
    relativePath: '[docsSetSlug]/llms.txt/route.ts',
  },
  {
    content: `export { GET } from '../../payloadMarkdownDocsAssetRoute'

export const dynamic = 'force-dynamic'
`,
    relativePath: '[docsSetSlug]/llms-full.txt/route.ts',
  },
  {
    content: `export { GET } from '../../../../payloadMarkdownDocsAssetRoute'

export const dynamic = 'force-dynamic'
`,
    relativePath: '[docsSetSlug]/skills/[agent]/[[...assetPath]]/route.ts',
  },
]

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath)

    return true
  } catch {
    return false
  }
}

export const findPayloadAppDirWithAssetRoutes = async (
  cwd = process.cwd(),
): Promise<string | undefined> => {
  for (const candidate of payloadAppDirCandidates) {
    const absoluteCandidate = path.resolve(cwd, candidate)
    const exists = await Promise.all(
      assetRouteScaffoldFiles.map((file) =>
        fileExists(path.join(absoluteCandidate, file.relativePath)),
      ),
    )

    if (exists.every(Boolean)) {
      return candidate
    }
  }

  return undefined
}

