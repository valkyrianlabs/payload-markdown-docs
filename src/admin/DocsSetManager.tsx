import type { UIFieldServerProps } from 'payload'
import type { ReactNode } from 'react'

import type {
  DocsSetManagerData,
  DocsSetManagerDocItem,
  DocsSetManagerPayloadOperations,
} from './docsSetManagerTypes.js'

import {
  DEFAULT_DOCS_COLLECTION_SLUG,
  DEFAULT_DOCS_GROUPS_COLLECTION_SLUG,
  DEFAULT_DOCS_SETS_COLLECTION_SLUG,
} from '../constants.js'
import { getDocsSetManagerData } from './docsSetManagerData.js'

type DocsSetManagerFieldCustom = {
  docsCollectionSlug?: string
  docsGroupsCollectionSlug?: string
  docsSetsCollectionSlug?: string
}

const getFieldCustom = (
  field: UIFieldServerProps['field'],
): DocsSetManagerFieldCustom => {
  const custom = 'custom' in field ? field.custom : undefined

  if (!custom || typeof custom !== 'object') {
    return {}
  }

  return custom as DocsSetManagerFieldCustom
}

const formatDate = (value?: string): string => {
  if (!value) {
    return 'Never'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toISOString()
}

const StatusLabel = ({ item }: { item: DocsSetManagerDocItem }) => {
  if (item.archived) {
    return <span>archived</span>
  }

  if (item.draft) {
    return <span>draft</span>
  }

  if (item.published) {
    return <span>published</span>
  }

  return <span>synced</span>
}

const OverrideSummary = ({ item }: { item: DocsSetManagerDocItem }) => {
  if (item.overrideSummary.length === 0) {
    return <span>none</span>
  }

  return <span>{item.overrideSummary.join(', ')}</span>
}

const renderDocItem = (item: DocsSetManagerDocItem): ReactNode => {
  if (item.kind === 'folder') {
    return (
      <details key={item.id}>
        <summary>{item.title}</summary>
        <div>
          {item.children?.map((child) => renderDocItem(child))}
        </div>
      </details>
    )
  }

  return (
    <details key={item.id}>
      <summary>{item.sourcePath}</summary>
      <dl>
        <div>
          <dt>Route</dt>
          <dd>{item.route || 'Missing route'}</dd>
        </div>
        <div>
          <dt>Title</dt>
          <dd>{item.title}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>
            <StatusLabel item={item} />
          </dd>
        </div>
        <div>
          <dt>Overrides</dt>
          <dd>
            <OverrideSummary item={item} />
          </dd>
        </div>
      </dl>
      {item.adminURL ? <a href={item.adminURL}>Open generated doc</a> : null}
    </details>
  )
}

const Summary = ({ data }: { data: DocsSetManagerData }) => (
  <dl>
    <div>
      <dt>Docs</dt>
      <dd>{data.summary.total}</dd>
    </div>
    <div>
      <dt>Archived</dt>
      <dd>{data.summary.archived}</dd>
    </div>
    <div>
      <dt>Drafts</dt>
      <dd>{data.summary.drafts}</dd>
    </div>
    <div>
      <dt>Published</dt>
      <dd>{data.summary.published}</dd>
    </div>
    <div>
      <dt>Hidden from nav</dt>
      <dd>{data.summary.hiddenFromNav}</dd>
    </div>
    <div>
      <dt>With overrides</dt>
      <dd>{data.summary.withOverrides}</dd>
    </div>
    <div>
      <dt>Last sync</dt>
      <dd>{formatDate(data.sync?.lastSyncedAt)}</dd>
    </div>
    <div>
      <dt>Last status</dt>
      <dd>{data.sync?.lastStatus ?? 'unknown'}</dd>
    </div>
  </dl>
)

export const DocsSetManager = async ({
  id,
  field,
  payload,
  req,
}: UIFieldServerProps) => {
  const custom = getFieldCustom(field)
  const docsCollectionSlug = custom.docsCollectionSlug ?? DEFAULT_DOCS_COLLECTION_SLUG
  const docsGroupsCollectionSlug =
    custom.docsGroupsCollectionSlug ?? DEFAULT_DOCS_GROUPS_COLLECTION_SLUG
  const docsSetsCollectionSlug =
    custom.docsSetsCollectionSlug ?? DEFAULT_DOCS_SETS_COLLECTION_SLUG

  if (!id) {
    return (
      <section>
        <h2>Generated Docs</h2>
        <p>Save this docs set before reviewing generated docs records.</p>
      </section>
    )
  }

  const data = await getDocsSetManagerData({
    adminRoute: req.payload.config.routes.admin,
    docsCollectionSlug,
    docsGroupsCollectionSlug,
    docsSetId: String(id),
    docsSetsCollectionSlug,
    payload: payload as DocsSetManagerPayloadOperations,
  })

  return (
    <section>
      <header>
        <h2>Generated Docs</h2>
        <p>
          Review generated docs records for {data.docsSet.title}. Source docs remain
          Git-backed; per-doc overrides can be edited by opening a generated doc.
        </p>
      </header>

      <section>
        <h3>Effective Route</h3>
        <p>{data.docsSet.routeBase || 'No route available yet'}</p>
      </section>

      <section>
        <h3>Sync Summary</h3>
        <Summary data={data} />
      </section>

      {data.warnings.length > 0 ? (
        <section>
          <h3>Warnings</h3>
          <ul>
            {data.warnings.map((warning) => (
              <li key={`${warning.docId ?? 'docs-set'}:${warning.message}`}>
                {warning.sourcePath ? `${warning.sourcePath}: ` : null}
                {warning.message}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h3>Generated Docs</h3>
        {data.tree.length > 0 ? (
          <div>{data.tree.map((item) => renderDocItem(item))}</div>
        ) : (
          <p>No generated docs records are linked to this docs set yet.</p>
        )}
      </section>
    </section>
  )
}
