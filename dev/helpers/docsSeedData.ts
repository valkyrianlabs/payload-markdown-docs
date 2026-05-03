export const devDocsSourceId = 'payload-markdown-docs'
export const devDocsGroupSlug = 'docs-groups'
export const devDocsSetSlug = 'docs-sets'

export type PayloadRecordId = number | string

export const getPayloadRecordId = (record: unknown): PayloadRecordId | undefined => {
  if (!record || typeof record !== 'object' || !('id' in record)) {
    return undefined
  }

  const id = (record as { id?: PayloadRecordId }).id

  return id === undefined ? undefined : id
}

export const buildDevDocsGroupSeedData = () => ({
  slug: 'plugins',
  description: 'Dev docs namespace for plugin documentation.',
  navTitle: 'Plugins',
  order: 0,
  routePath: '/plugins',
  serveIndex: false,
  title: 'Plugins',
})

export const buildDevDocsSetSeedData = ({
  groupId,
}: {
  groupId?: PayloadRecordId
} = {}) => ({
  defaults: {
    heroDescription: 'Local dev harness for the dedicated docs workflow.',
    heroTitle: 'Payload Markdown Docs',
    sidebarMode: 'auto',
  },
  description: 'Local dev docs set for end-to-end dedicated docs testing.',
  ...(groupId !== undefined ? { group: groupId } : {}),
  slug: 'payload-markdown-docs',
  navTitle: 'Payload Markdown Docs',
  order: 0,
  routeBase: '/plugins/payload-markdown-docs',
  sourceId: devDocsSourceId,
  sourceRoot: 'docs',
  title: 'Payload Markdown Docs',
})
