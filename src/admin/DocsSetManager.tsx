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

const managerStyles = `
  .payload-markdown-docs-manager {
    --pmd-border: var(--theme-elevation-150, #d7d7d7);
    --pmd-border-strong: var(--theme-elevation-250, #bcbcbc);
    --pmd-surface: var(--theme-elevation-0, #ffffff);
    --pmd-surface-soft: var(--theme-elevation-50, #f7f7f7);
    --pmd-surface-raised: var(--theme-elevation-100, #f0f0f0);
    --pmd-text: var(--theme-text, #111111);
    --pmd-text-muted: var(--theme-elevation-600, #5b5b5b);
    --pmd-text-subtle: var(--theme-elevation-500, #727272);
    --pmd-success: var(--theme-success-500, #3c7d45);
    --pmd-warning: var(--theme-warning-500, #a15c00);
    --pmd-error: var(--theme-error-500, #b91c1c);
    color: var(--pmd-text);
    display: grid;
    gap: 1rem;
    margin-block-start: 1.25rem;
  }

  .payload-markdown-docs-manager * {
    box-sizing: border-box;
  }

  .payload-markdown-docs-manager__header {
    border-block-end: 1px solid var(--pmd-border);
    display: grid;
    gap: 0.35rem;
    padding-block-end: 1rem;
  }

  .payload-markdown-docs-manager__header h2,
  .payload-markdown-docs-manager__panel h3 {
    margin: 0;
  }

  .payload-markdown-docs-manager__header p,
  .payload-markdown-docs-manager__empty p,
  .payload-markdown-docs-manager__notice p {
    color: var(--pmd-text-muted);
    line-height: 1.55;
    margin: 0;
    max-width: 68rem;
  }

  .payload-markdown-docs-manager__panel {
    background: var(--pmd-surface);
    border: 1px solid var(--pmd-border);
    border-radius: 8px;
    overflow: hidden;
  }

  .payload-markdown-docs-manager__panel-header {
    align-items: center;
    background: var(--pmd-surface-soft);
    border-block-end: 1px solid var(--pmd-border);
    display: flex;
    gap: 0.75rem;
    justify-content: space-between;
    padding: 0.85rem 1rem;
  }

  .payload-markdown-docs-manager__panel-header h3 {
    font-size: 1rem;
  }

  .payload-markdown-docs-manager__panel-body {
    padding: 1rem;
  }

  .payload-markdown-docs-manager__route {
    align-items: center;
    background: var(--pmd-surface-soft);
    border: 1px solid var(--pmd-border);
    border-radius: 6px;
    display: flex;
    flex-wrap: wrap;
    gap: 0.65rem;
    justify-content: space-between;
    min-height: 3rem;
    padding: 0.75rem 0.85rem;
  }

  .payload-markdown-docs-manager__route code {
    font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
    font-size: 0.9rem;
    overflow-wrap: anywhere;
  }

  .payload-markdown-docs-manager__summary {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
    margin: 0;
  }

  .payload-markdown-docs-manager__stat {
    background: var(--pmd-surface-soft);
    border: 1px solid var(--pmd-border);
    border-radius: 6px;
    display: grid;
    gap: 0.3rem;
    min-height: 5rem;
    padding: 0.8rem;
  }

  .payload-markdown-docs-manager__stat dt {
    color: var(--pmd-text-muted);
    font-size: 0.8rem;
    font-weight: 600;
    margin: 0;
  }

  .payload-markdown-docs-manager__stat dd {
    font-size: 1.25rem;
    font-weight: 600;
    line-height: 1.2;
    margin: 0;
    overflow-wrap: anywhere;
  }

  .payload-markdown-docs-manager__notice {
    background: color-mix(in srgb, var(--pmd-warning) 8%, transparent);
    border: 1px solid color-mix(in srgb, var(--pmd-warning) 28%, var(--pmd-border));
    border-radius: 6px;
    margin-block-start: 0.85rem;
    padding: 0.75rem 0.85rem;
  }

  .payload-markdown-docs-manager__warnings {
    display: grid;
    gap: 0.55rem;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .payload-markdown-docs-manager__warning {
    background: color-mix(in srgb, var(--pmd-error) 7%, transparent);
    border: 1px solid color-mix(in srgb, var(--pmd-error) 24%, var(--pmd-border));
    border-radius: 6px;
    line-height: 1.5;
    padding: 0.7rem 0.85rem;
  }

  .payload-markdown-docs-manager__warning-source {
    display: block;
    font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
    font-size: 0.8rem;
    margin-block-end: 0.15rem;
  }

  .payload-markdown-docs-manager__tree {
    display: grid;
    gap: 0.7rem;
  }

  .payload-markdown-docs-manager__folder {
    border: 1px solid var(--pmd-border);
    border-radius: 7px;
    overflow: hidden;
  }

  .payload-markdown-docs-manager__folder > summary {
    align-items: center;
    background: var(--pmd-surface-soft);
    cursor: pointer;
    display: grid;
    gap: 0.65rem;
    grid-template-columns: minmax(0, 1fr) auto;
    list-style: none;
    padding: 0.75rem 0.85rem;
  }

  .payload-markdown-docs-manager__folder > summary::-webkit-details-marker {
    display: none;
  }

  .payload-markdown-docs-manager__folder-title {
    align-items: center;
    display: flex;
    font-weight: 600;
    gap: 0.5rem;
    min-width: 0;
  }

  .payload-markdown-docs-manager__folder-title::before {
    border-block-end: 2px solid currentColor;
    border-inline-end: 2px solid currentColor;
    content: "";
    height: 0.45rem;
    transform: rotate(-45deg);
    transition: transform 120ms ease;
    width: 0.45rem;
  }

  .payload-markdown-docs-manager__folder[open] > summary .payload-markdown-docs-manager__folder-title::before {
    transform: rotate(45deg);
  }

  .payload-markdown-docs-manager__folder-count {
    color: var(--pmd-text-muted);
    font-size: 0.8rem;
    white-space: nowrap;
  }

  .payload-markdown-docs-manager__children {
    display: grid;
    gap: 0.65rem;
    padding: 0.75rem;
  }

  .payload-markdown-docs-manager__doc {
    align-items: start;
    background: var(--pmd-surface);
    border: 1px solid var(--pmd-border);
    border-radius: 7px;
    display: grid;
    gap: 0.85rem;
    grid-template-columns: minmax(0, 1fr) auto;
    padding: 0.85rem;
  }

  .payload-markdown-docs-manager__doc-main {
    display: grid;
    gap: 0.45rem;
    min-width: 0;
  }

  .payload-markdown-docs-manager__doc-heading {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
  }

  .payload-markdown-docs-manager__doc-title {
    color: var(--pmd-text);
    font-weight: 600;
    line-height: 1.35;
    min-width: 0;
  }

  .payload-markdown-docs-manager__doc-path,
  .payload-markdown-docs-manager__doc-route {
    font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
    font-size: 0.82rem;
    line-height: 1.45;
    overflow-wrap: anywhere;
  }

  .payload-markdown-docs-manager__doc-path {
    color: var(--pmd-text-muted);
  }

  .payload-markdown-docs-manager__doc-route {
    color: var(--pmd-text);
  }

  .payload-markdown-docs-manager__meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin: 0;
  }

  .payload-markdown-docs-manager__meta div {
    align-items: center;
    background: var(--pmd-surface-soft);
    border: 1px solid var(--pmd-border);
    border-radius: 999px;
    display: inline-flex;
    gap: 0.35rem;
    min-height: 1.8rem;
    padding: 0.25rem 0.55rem;
  }

  .payload-markdown-docs-manager__meta dt {
    color: var(--pmd-text-subtle);
    font-size: 0.72rem;
    font-weight: 600;
    margin: 0;
  }

  .payload-markdown-docs-manager__meta dd {
    color: var(--pmd-text);
    font-size: 0.78rem;
    margin: 0;
  }

  .payload-markdown-docs-manager__actions {
    display: flex;
    justify-content: flex-end;
  }

  .payload-markdown-docs-manager__link {
    align-items: center;
    border: 1px solid var(--pmd-border-strong);
    border-radius: 6px;
    color: var(--pmd-text);
    display: inline-flex;
    font-size: 0.85rem;
    font-weight: 600;
    min-height: 2rem;
    padding: 0.35rem 0.65rem;
    text-decoration: none;
    white-space: nowrap;
  }

  .payload-markdown-docs-manager__link:hover {
    background: var(--pmd-surface-raised);
  }

  .payload-markdown-docs-manager__status,
  .payload-markdown-docs-manager__chip {
    align-items: center;
    border-radius: 999px;
    display: inline-flex;
    font-size: 0.75rem;
    font-weight: 600;
    line-height: 1;
    min-height: 1.5rem;
    padding: 0.3rem 0.55rem;
    white-space: nowrap;
  }

  .payload-markdown-docs-manager__status--published,
  .payload-markdown-docs-manager__status--synced {
    background: color-mix(in srgb, var(--pmd-success) 12%, transparent);
    color: var(--pmd-success);
  }

  .payload-markdown-docs-manager__status--draft {
    background: color-mix(in srgb, var(--pmd-warning) 12%, transparent);
    color: var(--pmd-warning);
  }

  .payload-markdown-docs-manager__status--archived {
    background: var(--pmd-surface-raised);
    color: var(--pmd-text-muted);
  }

  .payload-markdown-docs-manager__chip {
    background: var(--pmd-surface-raised);
    color: var(--pmd-text-muted);
  }

  .payload-markdown-docs-manager__chips {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }

  .payload-markdown-docs-manager__empty {
    align-items: start;
    background: var(--pmd-surface-soft);
    border: 1px dashed var(--pmd-border-strong);
    border-radius: 7px;
    display: grid;
    gap: 0.35rem;
    padding: 1rem;
  }

  .payload-markdown-docs-manager__empty strong {
    font-weight: 600;
  }

  @media (max-width: 720px) {
    .payload-markdown-docs-manager__doc {
      grid-template-columns: 1fr;
    }

    .payload-markdown-docs-manager__panel-header {
      align-items: start;
      flex-direction: column;
    }

    .payload-markdown-docs-manager__actions {
      justify-content: flex-start;
    }
  }
`

const getFieldCustom = (field: UIFieldServerProps['field']): DocsSetManagerFieldCustom => {
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

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

const formatSyncStatus = (
  status?: NonNullable<DocsSetManagerData['sync']>['lastStatus'],
): string => {
  if (!status) {
    return 'Unknown'
  }

  return `${status.charAt(0).toUpperCase()}${status.slice(1)}`
}

const getStatusLabel = (item: DocsSetManagerDocItem): string => {
  if (item.archived) {
    return 'Archived'
  }

  if (item.draft) {
    return 'Draft'
  }

  if (item.published) {
    return 'Published'
  }

  return 'Synced'
}

const StatusLabel = ({ item }: { item: DocsSetManagerDocItem }) => {
  return (
    <span
      className={`payload-markdown-docs-manager__status payload-markdown-docs-manager__status--${item.status}`}
    >
      {getStatusLabel(item)}
    </span>
  )
}

const OverrideSummary = ({ item }: { item: DocsSetManagerDocItem }) => {
  if (item.overrideSummary.length === 0) {
    return <span className="payload-markdown-docs-manager__chip">No overrides</span>
  }

  return (
    <span className="payload-markdown-docs-manager__chips">
      {item.overrideSummary.map((override) => (
        <span className="payload-markdown-docs-manager__chip" key={override}>
          {override}
        </span>
      ))}
    </span>
  )
}

const getDocCount = (item: DocsSetManagerDocItem): number => {
  if (item.kind === 'doc') {
    return 1
  }

  return item.children?.reduce((count, child) => count + getDocCount(child), 0) ?? 0
}

const renderDocItem = (item: DocsSetManagerDocItem, depth = 0): ReactNode => {
  if (item.kind === 'folder') {
    const docCount = getDocCount(item)

    return (
      <details className="payload-markdown-docs-manager__folder" key={item.id} open={depth === 0}>
        <summary>
          <span className="payload-markdown-docs-manager__folder-title">{item.title}</span>
          <span className="payload-markdown-docs-manager__folder-count">
            {docCount} {docCount === 1 ? 'doc' : 'docs'}
          </span>
        </summary>
        <div className="payload-markdown-docs-manager__children">
          {item.children?.map((child) => renderDocItem(child, depth + 1))}
        </div>
      </details>
    )
  }

  return (
    <article className="payload-markdown-docs-manager__doc" key={item.id}>
      <div className="payload-markdown-docs-manager__doc-main">
        <div className="payload-markdown-docs-manager__doc-heading">
          <span className="payload-markdown-docs-manager__doc-title">{item.title}</span>
          <StatusLabel item={item} />
        </div>
        <div className="payload-markdown-docs-manager__doc-path">{item.sourcePath}</div>
        <div className="payload-markdown-docs-manager__doc-route">
          {item.route || 'Missing route'}
        </div>
        <dl className="payload-markdown-docs-manager__meta">
          <div>
            <dt>Overrides</dt>
            <dd>
              <OverrideSummary item={item} />
            </dd>
          </div>
          {item.hiddenFromNav ? (
            <div>
              <dt>Nav</dt>
              <dd>Hidden</dd>
            </div>
          ) : null}
        </dl>
      </div>
      {item.adminURL ? (
        <div className="payload-markdown-docs-manager__actions">
          <a className="payload-markdown-docs-manager__link" href={item.adminURL}>
            Open doc
          </a>
        </div>
      ) : null}
    </article>
  )
}

const Summary = ({ data }: { data: DocsSetManagerData }) => {
  const items = [
    ['Docs', data.summary.total],
    ['Archived', data.summary.archived],
    ['Drafts', data.summary.drafts],
    ['Published', data.summary.published],
    ['Hidden from nav', data.summary.hiddenFromNav],
    ['With overrides', data.summary.withOverrides],
    ['Last sync', formatDate(data.sync?.lastSyncedAt)],
    ['Last status', formatSyncStatus(data.sync?.lastStatus)],
  ] as const

  return (
    <dl className="payload-markdown-docs-manager__summary">
      {items.map(([label, value]) => (
        <div className="payload-markdown-docs-manager__stat" key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

const ManagerStyles = () => <style>{managerStyles}</style>

const EmptyState = ({ children, title }: { children: ReactNode; title: string }) => (
  <div className="payload-markdown-docs-manager__empty">
    <strong>{title}</strong>
    <p>{children}</p>
  </div>
)

const UnsavedDocsSetManager = () => (
  <section className="payload-markdown-docs-manager">
    <ManagerStyles />
    <header className="payload-markdown-docs-manager__header">
      <h2>Generated Docs</h2>
    </header>
    <section className="payload-markdown-docs-manager__panel">
      <div className="payload-markdown-docs-manager__panel-body">
        <EmptyState title="Save this docs set first">
          Generated docs records are available after the docs set has been saved.
        </EmptyState>
      </div>
    </section>
  </section>
)

const GeneratedDocsWarnings = ({ data }: { data: DocsSetManagerData }) => (
  <section className="payload-markdown-docs-manager__panel">
    <div className="payload-markdown-docs-manager__panel-header">
      <h3>Warnings</h3>
    </div>
    <div className="payload-markdown-docs-manager__panel-body">
      <ul className="payload-markdown-docs-manager__warnings">
        {data.warnings.map((warning) => (
          <li
            className="payload-markdown-docs-manager__warning"
            key={`${warning.docId ?? 'docs-set'}:${warning.message}`}
          >
            {warning.sourcePath ? (
              <span className="payload-markdown-docs-manager__warning-source">
                {warning.sourcePath}
              </span>
            ) : null}
            {warning.message}
          </li>
        ))}
      </ul>
    </div>
  </section>
)

const GeneratedDocsTree = ({ data }: { data: DocsSetManagerData }) => (
  <section className="payload-markdown-docs-manager__panel">
    <div className="payload-markdown-docs-manager__panel-header">
      <h3>Generated Docs</h3>
      <span className="payload-markdown-docs-manager__folder-count">
        {data.summary.total} {data.summary.total === 1 ? 'record' : 'records'}
      </span>
    </div>
    <div className="payload-markdown-docs-manager__panel-body">
      {data.tree.length > 0 ? (
        <div className="payload-markdown-docs-manager__tree">
          {data.tree.map((item) => renderDocItem(item))}
        </div>
      ) : (
        <EmptyState title="No generated docs yet">
          No generated docs records are linked to this docs set yet.
        </EmptyState>
      )}
    </div>
  </section>
)

const GeneratedDocsOverview = ({ data }: { data: DocsSetManagerData }) => (
  <>
    <section className="payload-markdown-docs-manager__panel">
      <div className="payload-markdown-docs-manager__panel-header">
        <h3>Effective Route</h3>
      </div>
      <div className="payload-markdown-docs-manager__panel-body">
        <div className="payload-markdown-docs-manager__route">
          <code>{data.docsSet.routeBase || 'No route available yet'}</code>
        </div>
      </div>
    </section>

    <section className="payload-markdown-docs-manager__panel">
      <div className="payload-markdown-docs-manager__panel-header">
        <h3>Sync Summary</h3>
      </div>
      <div className="payload-markdown-docs-manager__panel-body">
        <Summary data={data} />
        {data.summary.drafts > 0 ? (
          <div className="payload-markdown-docs-manager__notice">
            <p>{data.summary.drafts} generated docs records are drafts and are not public.</p>
          </div>
        ) : null}
      </div>
    </section>
  </>
)

export const DocsSetManager = async ({ id, field, payload, req }: UIFieldServerProps) => {
  const custom = getFieldCustom(field)
  const docsCollectionSlug = custom.docsCollectionSlug ?? DEFAULT_DOCS_COLLECTION_SLUG
  const docsGroupsCollectionSlug =
    custom.docsGroupsCollectionSlug ?? DEFAULT_DOCS_GROUPS_COLLECTION_SLUG
  const docsSetsCollectionSlug = custom.docsSetsCollectionSlug ?? DEFAULT_DOCS_SETS_COLLECTION_SLUG

  if (!id) {
    return <UnsavedDocsSetManager />
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
    <section className="payload-markdown-docs-manager">
      <ManagerStyles />
      <header className="payload-markdown-docs-manager__header">
        <h2>Generated Docs</h2>
        <p>
          Review generated docs records for {data.docsSet.title}. Source docs remain Git-backed;
          per-doc overrides can be edited by opening a generated doc.
        </p>
      </header>

      <GeneratedDocsOverview data={data} />
      {data.warnings.length > 0 ? <GeneratedDocsWarnings data={data} /> : null}
      <GeneratedDocsTree data={data} />
    </section>
  )
}
