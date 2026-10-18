import { describe, expect, test, vi } from 'vitest'

import {
  createDocsSetProjectGuard,
  getDocsSetProjectSyncFields,
  isManualTitleDescription,
  PAYLOAD_MARKDOWN_DOCS_SYNC_CONTEXT_KEY,
  planDocsSetProjectUpdate,
} from './docsSetProject.js'

const stack = [{ category: 'languages', items: [{ name: 'C++23' }] }]

describe('planDocsSetProjectUpdate', () => {
  test('agent-owned docs sets take provided title and description', () => {
    expect(
      planDocsSetProjectUpdate({
        current: { description: 'Old', manualTitleDescription: false, title: 'Old' },
        project: { description: 'New', stack, title: 'New' },
      }),
    ).toEqual({
      data: { description: 'New', stack, title: 'New' },
      outcome: { description: 'updated', stack: 'updated', title: 'updated' },
    })
  })

  test('manual and pre-existing docs sets keep their title and description', () => {
    for (const manualTitleDescription of [true, null, undefined]) {
      expect(
        planDocsSetProjectUpdate({
          current: { manualTitleDescription, title: 'Admin' },
          project: { description: 'New', title: 'New' },
        }),
      ).toEqual({ data: {}, outcome: { description: 'manual', stack: 'not_provided', title: 'manual' } })
    }
  })

  test('missing values are not provided; an equal stack is unchanged; [] clears', () => {
    expect(
      planDocsSetProjectUpdate({ current: { manualTitleDescription: false, stack, title: 'T' }, project: { stack } }),
    ).toEqual({ data: { stack }, outcome: { description: 'not_provided', stack: 'unchanged', title: 'not_provided' } })
    expect(
      planDocsSetProjectUpdate({ current: { manualTitleDescription: false, stack }, project: { stack: [] } }).outcome
        .stack,
    ).toBe('cleared')
    expect(
      planDocsSetProjectUpdate({ current: { manualTitleDescription: false, title: 'Same' }, project: { title: 'Same' } })
        .outcome.title,
    ).toBe('unchanged')
  })

  test('sync bookkeeping records what the agent supplied', () => {
    expect(getDocsSetProjectSyncFields({ title: 'T' })).toEqual({ projectDescription: null, projectTitle: 'T' })
    expect(isManualTitleDescription(undefined)).toBe(true)
    expect(isManualTitleDescription(false)).toBe(false)
  })
})

describe('createDocsSetProjectGuard', () => {
  const guard = createDocsSetProjectGuard({ collectionSlug: 'docs-sets' })
  const run = (args: Record<string, unknown>, main?: Record<string, unknown>) =>
    guard({
      collection: {} as never,
      context: {},
      operation: 'update',
      originalDoc: { id: 1, stack: [], title: 'Stale' },
      req: { context: {}, payload: { db: { findOne: vi.fn(() => Promise.resolve(main ?? null)) } } } as never,
      ...args,
    } as never)

  test('restores Git-owned values from the main record', async () => {
    await expect(
      run(
        { data: { description: 'Admin', stack: [], title: 'Admin' } },
        {
          manualTitleDescription: false,
          stack,
          sync: { projectDescription: null, projectTitle: 'Agent' },
        },
      ),
    ).resolves.toEqual({
      description: 'Admin',
      stack,
      sync: { projectDescription: null, projectTitle: 'Agent' },
      title: 'Agent',
    })
  })

  test('leaves admin-owned title and description alone', async () => {
    await expect(
      run({ data: { title: 'Admin' } }, { manualTitleDescription: null, stack, sync: { projectTitle: 'Agent' } }),
    ).resolves.toMatchObject({ stack, title: 'Admin' })
  })

  test('lets sync writes through and defaults new docs sets to agent-owned', async () => {
    const data = { stack, title: 'Sync' }

    await expect(
      run({ data, req: { context: { [PAYLOAD_MARKDOWN_DOCS_SYNC_CONTEXT_KEY]: true } } }),
    ).resolves.toBe(data)
    await expect(run({ data: { slug: 'new', stack, title: 'New' }, operation: 'create' })).resolves.toEqual({
      slug: 'new',
      manualTitleDescription: false,
      title: 'New',
    })
  })
})
