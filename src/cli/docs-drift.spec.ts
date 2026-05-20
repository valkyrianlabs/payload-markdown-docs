import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const auditedRoots = [
  '.codex/context.md',
  '.github',
  'README.md',
  'docs',
  'examples',
  'skills',
]

const textExtensions = new Set(['.md', '.txt', '.yaml', '.yml'])

const skillPaths = [
  'skills/payload-markdown-docs/codex/SKILL.md',
  'skills/payload-markdown-docs/claude/SKILL.md',
]

const allowedIndexAiFiles = new Set([
  'docs/reference/migration.md',
  'skills/payload-markdown-docs/claude/SKILL.md',
  'skills/payload-markdown-docs/codex/SKILL.md',
])

const allowedNegativeRuleFiles = new Set([
  'docs/reference/migration.md',
  'skills/payload-markdown-docs/claude/SKILL.md',
  'skills/payload-markdown-docs/codex/SKILL.md',
])

type AuditedFile = {
  content: string
  path: string
}

const isAuditedFile = (filePath: string): boolean => {
  if (path.basename(filePath) === 'README.md') {
    return true
  }

  return textExtensions.has(path.extname(filePath))
}

const collectFiles = async (inputPath: string): Promise<string[]> => {
  const entries = await readdir(inputPath, {
    withFileTypes: true,
  }).catch(() => undefined)

  if (!entries) {
    return isAuditedFile(inputPath) ? [inputPath] : []
  }

  const files: string[] = []

  for (const entry of entries) {
    const entryPath = path.join(inputPath, entry.name)

    if (entry.isDirectory()) {
      files.push(...(await collectFiles(entryPath)))
      continue
    }

    if (entry.isFile() && isAuditedFile(entryPath)) {
      files.push(entryPath)
    }
  }

  return files
}

const readAuditedFiles = async (): Promise<AuditedFile[]> => {
  const files = (await Promise.all(auditedRoots.map((root) => collectFiles(root))))
    .flat()
    .sort()

  return Promise.all(
    files.map(async (file) => ({
      content: await readFile(file, 'utf8'),
      path: file.split(path.sep).join('/'),
    })),
  )
}

const extractFencedBlocks = (content: string, language: string): string[] => {
  const blocks: string[] = []
  const pattern = new RegExp(`\`\`\`${language}\\n([\\s\\S]*?)\\n\`\`\``, 'g')
  let match: null | RegExpExecArray

  while ((match = pattern.exec(content))) {
    blocks.push(match[1] ?? '')
  }

  return blocks
}

const hasDryRunNearOidc = (lines: string[], index: number): boolean => {
  const after = lines.slice(index, index + 5).join('\n')

  if (!after.includes('--dry-run')) {
    return false
  }

  const before = lines.slice(Math.max(0, index - 8), index).join('\n').toLowerCase()

  return before.includes('dry-run') || before.includes('pull request')
}

const staleDocsPatterns = [
  /\binstall\s+ai-skill\b/,
  /\binstall\s+ai-routes\b/,
  /\binstall\s+asset-routes\b/,
  /--sync\b/,
  /serveIndex/,
  /legacyServeIndex/,
  /legacyDefault/,
  /requireDryRunBeforeApply/,
  /\bDocsPreviewBlock\b/,
  /getPayloadMarkdownDocsLinks/,
  /createPayloadMarkdownDocsAssetResponse/,
  /createPayloadMarkdownDocsLlmsResponse/,
  /createPayloadMarkdownDocsSkillAssetResponse/,
  /resolvePayloadMarkdownDocsAssetRoute/,
  /routeBase/,
  /routePath/,
  /socialBanner/,
  /heroBanner/,
  /shareCard/,
  /marketingBanner/,
  /\bheros\s*:/,
  /`heros`/,
  /variant:\s*['"]default['"]/,
]

const rootBlockImportPattern =
  /import\s*\{[^}]*\b(?:DocsCTABlock|backgroundMediaFields|buttonField|ctaButtonsField|linkField|linksArrayField|skillCTAFields)\b[^}]*\}\s*from\s*['"]@valkyrianlabs\/payload-markdown-docs['"]/

describe('documentation and skill drift guard', () => {
  it('keeps served skill contracts aligned with current push and asset behavior', async () => {
    for (const skillPath of skillPaths) {
      const content = await readFile(skillPath, 'utf8')
      const bashBlocks = extractFencedBlocks(content, 'bash')
      const firstOidcBlock = bashBlocks.find((block) => block.includes('--github-oidc'))

      expect(content, skillPath).toContain('Manifest `files` are docs records.')
      expect(content, skillPath).toContain('Manifest `assets` are skill files')
      expect(content, skillPath).toContain('Skill files are not docs records')
      expect(content, skillPath).toContain('`push` defaults to sync mode')
      expect(content, skillPath).toContain('Use `--dry-run` only for an explicit dry-run')
      expect(content, skillPath).toContain('Public raw asset URLs require committed Next route files')
      expect(content, skillPath).toContain('/api/...` asset URLs are implementation/internal fallback')
      expect(content, skillPath).toContain('Do not create `index.ai.yml`.')
      expect(content, skillPath).toContain('Do not create `index.ai.yaml`.')

      expect(firstOidcBlock, skillPath).toBeDefined()
      expect(firstOidcBlock, skillPath).not.toContain('--dry-run')
      expect(bashBlocks.join('\n'), skillPath).not.toContain('--sync')
    }
  })

  it('does not reintroduce stale sync and AI export instructions', async () => {
    const files = await readAuditedFiles()

    for (const file of files) {
      const lines = file.content.split('\n')

      if (!allowedIndexAiFiles.has(file.path)) {
        expect(file.content, file.path).not.toMatch(/index\.ai\.ya?ml/)
      }

      expect(file.content, file.path).not.toContain('--sync')
      if (!allowedNegativeRuleFiles.has(file.path)) {
        expect(file.content, file.path).not.toMatch(/\/plugins\/<name>\.md/)
        expect(file.content, file.path).not.toMatch(/single consolidated AI Markdown export file/i)
      }

      lines.forEach((line, index) => {
        if (line.includes('--github-oidc') && hasDryRunNearOidc(lines, index)) {
          const before = lines.slice(Math.max(0, index - 8), index).join('\n').toLowerCase()
          expect(before, `${file.path}:${index + 1}`).toMatch(/dry-run|pull request/)
        }
      })
    }
  })

  it('does not document removed v1 public APIs or legacy fields', async () => {
    const files = await readAuditedFiles()

    for (const file of files) {
      for (const pattern of staleDocsPatterns) {
        expect(file.content, `${file.path} should not match ${pattern}`).not.toMatch(pattern)
      }

      expect(file.content, `${file.path} must import optional blocks from /blocks`).not.toMatch(
        rootBlockImportPattern,
      )
    }
  })
})
