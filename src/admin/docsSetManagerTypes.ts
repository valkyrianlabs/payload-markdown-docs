export type RawDocsSetRecord = {
  group?: { id?: number | string } | null | number | string
  id?: number | string
  slug?: string
  sync?: {
    docsCount?: null | number
    lastStatus?: 'failed' | 'pending' | 'success' | null
    lastSyncedAt?: null | string
  }
  title?: string
}

export type RawDocsGroupRecord = {
  id?: number | string
  parent?: { id?: number | string } | null | number | string
  slug?: string
}

export type RawDocsRecord = {
  _status?: 'draft' | 'published'
  description?: null | string
  docsSet?: { id?: number | string } | null | number | string
  id?: number | string
  navTitle?: null | string
  order?: null | number
  overrides?: {
    hideFromNav?: boolean | null
    navTitle?: null | string
  }
  route?: null | string
  sourcePath?: null | string
  sync?: {
    archived?: boolean | null
    archivedAt?: null | string
    lastSyncedAt?: null | string
    sourceId?: null | string
  }
  title?: null | string
}

export type DocsSetManagerWarning = {
  docId?: string
  message: string
  sourcePath?: string
}

export type DocsSetManagerDocStatus =
  | 'archived'
  | 'draft'
  | 'published'
  | 'synced'

export type DocsSetManagerDocItem = {
  adminURL?: string
  archived?: boolean
  children?: DocsSetManagerDocItem[]
  draft?: boolean
  hiddenFromNav?: boolean
  id: string
  kind: 'doc' | 'folder'
  order: number
  overrideSummary: string[]
  published?: boolean
  route: string
  sourcePath: string
  status: DocsSetManagerDocStatus
  title: string
}

export type DocsSetManagerData = {
  docs: DocsSetManagerDocItem[]
  docsSet: {
    id: string
    routeBase: string
    slug: string
    title: string
  }
  summary: {
    archived: number
    drafts: number
    hiddenFromNav: number
    published: number
    total: number
    withOverrides: number
  }
  sync?: {
    docsCount?: number
    lastStatus?: 'failed' | 'pending' | 'success'
    lastSyncedAt?: string
  }
  tree: DocsSetManagerDocItem[]
  warnings: DocsSetManagerWarning[]
}

export type DocsSetManagerPayloadOperations = {
  find: (args: {
    collection: string
    depth?: number
    limit?: number
    overrideAccess?: boolean
    where?: unknown
  }) => Promise<{
    docs: unknown[]
  }>
  findByID: (args: {
    collection: string
    depth?: number
    id: number | string
    overrideAccess?: boolean
  }) => Promise<unknown>
}
