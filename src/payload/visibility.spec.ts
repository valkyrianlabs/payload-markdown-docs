import { describe, expect, it } from 'vitest'

import {
  getDocsRecordLifecycleStatus,
  getPayloadDraftStatus,
  isPublicDocsAssetRecord,
  isPublicDocsRecord,
  isPublicDocsSetRecord,
  isVisibleToReader,
  notArchivedWhere,
  publishedWhere,
} from './visibility.js'

describe('record visibility', () => {
  const published = { _status: 'published' }
  const draft = { _status: 'draft' }
  const archived = { _status: 'published', sync: { archived: true } }
  const noDrafts = { title: 'collection without drafts' }

  it('applies the public rules to raw records', () => {
    expect([published, draft, archived, noDrafts, null].map(isPublicDocsRecord)).toEqual([
      true,
      false,
      false,
      true,
      false,
    ])
    expect([published, draft, archived, noDrafts].map(isPublicDocsSetRecord)).toEqual([
      true,
      false,
      true,
      true,
    ])
    expect([published, draft, archived, noDrafts].map(isPublicDocsAssetRecord)).toEqual([
      true,
      true,
      false,
      true,
    ])
  })

  it('applies the reader rule to resolved records', () => {
    expect(isVisibleToReader({ status: 'published' })).toBe(true)
    expect(isVisibleToReader({})).toBe(true)
    expect(isVisibleToReader({ status: 'draft' })).toBe(false)
    expect(isVisibleToReader({ includeDrafts: true, status: 'draft' })).toBe(true)
    expect(isVisibleToReader({ archived: true, includeDrafts: true, status: 'published' })).toBe(
      false,
    )
  })

  it('labels lifecycle status for the admin manager', () => {
    expect([archived, draft, published, noDrafts].map(getDocsRecordLifecycleStatus)).toEqual([
      'archived',
      'draft',
      'published',
      'synced',
    ])
    expect(getPayloadDraftStatus({ _status: 'changed' })).toBeUndefined()
  })

  it('builds fresh where constraints', () => {
    expect(notArchivedWhere()).toEqual({ 'sync.archived': { not_equals: true } })
    expect(notArchivedWhere()).not.toBe(notArchivedWhere())
    expect(publishedWhere()).toEqual({ _status: { equals: 'published' } })
  })
})
