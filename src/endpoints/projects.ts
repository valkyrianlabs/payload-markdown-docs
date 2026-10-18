/**
 * Public, read-only projects API: every published docs set as a small allowlisted DTO
 * (title, description, SEO metadata, canonical URLs, docs group, technology stack) for
 * other sites to list. Disabled unless `publicApi.projects` is set.
 *
 * Records are read with the Local API and `overrideAccess`, like the other public
 * surfaces; the projection below is the boundary. Nothing else from a docs set (repository
 * bindings, OIDC and workflow settings, sync internals) is ever serialized.
 */
import type { Endpoint, PayloadRequest } from 'payload'

import { createHash } from 'node:crypto'

import type {
  DocsProject,
  DocsProjectResponse,
  DocsProjectsErrorResponse,
  DocsProjectsGroup,
  DocsProjectsImage,
  DocsProjectsListResponse,
} from '../projects/contract.js'
import type { DocsGroupsById } from '../routing/docsSetRoutes.js'

import { getDocsSetMetadataSource, isVisibleDocsSet, toResolvedDocsGroup, toResolvedDocsSet } from '../next/records.js'
import { getDocsSetStack } from '../payload/docsSetProject.js'
import { DOCS_PROJECTS_SCHEMA_VERSION } from '../projects/contract.js'
import { indexDocsGroupsById } from '../routing/docsSetRoutes.js'
import { getRelationshipId, isRecord } from '../shared/records.js'
import { getPublicRequestOrigin } from './publicOrigin.js'

export const DEFAULT_DOCS_PROJECTS_ENDPOINT_PATH = '/documentation/projects'

/** Short browser cache, longer shared cache, and stale responses while revalidating. */
const CACHE_CONTROL = 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400'

export type CreateDocsProjectsEndpointsOptions = {
  docsGroupsCollectionSlug: string
  docsSetsCollectionSlug: string
  path?: string
  trustForwardedHeaders?: boolean
}

type ListedProject = {
  groupOrder: number
  order: number
  project: DocsProject
}

const compareText = (first: string, second: string): number =>
  first < second ? -1 : first > second ? 1 : 0

const toAbsoluteUrl = (value: string, origin: string | undefined): string => {
  if (!origin) {
    return value
  }

  try {
    return new URL(value, `${origin}/`).toString()
  } catch {
    return value
  }
}

const toImage = (
  image: ReturnType<typeof getDocsSetMetadataSource>['image'],
  origin: string | undefined,
): DocsProjectsImage | null =>
  image
    ? {
        ...(image.alt ? { alt: image.alt } : {}),
        ...(image.height !== undefined ? { height: image.height } : {}),
        url: toAbsoluteUrl(image.url, origin),
        ...(image.width !== undefined ? { width: image.width } : {}),
      }
    : null

const toListedProject = ({
  doc,
  groupsById,
  origin,
}: {
  doc: unknown
  groupsById: DocsGroupsById
  origin: string | undefined
}): ListedProject | undefined => {
  const docsSet = toResolvedDocsSet(doc, groupsById)

  if (!docsSet?.slug || !isRecord(doc) || !isVisibleDocsSet({ docsSet })) {
    return undefined
  }

  const groupId = getRelationshipId(doc.group)
  const groupDoc = groupId ? groupsById.get(groupId) : undefined
  const group = groupDoc ? toResolvedDocsGroup(groupDoc, groupsById) : undefined
  const metadata = getDocsSetMetadataSource(docsSet)
  const sync = isRecord(doc.sync) ? doc.sync : {}

  return {
    groupOrder: group?.order ?? 0,
    order: docsSet.order,
    project: {
      slug: docsSet.slug,
      description: docsSet.description ?? null,
      group: group?.slug ? { slug: group.slug, title: group.title } : null,
      lastSyncedAt: typeof sync.lastSyncedAt === 'string' ? sync.lastSyncedAt : null,
      seo: {
        description: metadata.description ?? null,
        image: toImage(metadata.image, origin),
        title: metadata.title,
      },
      stack: getDocsSetStack(doc.stack),
      title: docsSet.title,
      updatedAt: typeof doc.updatedAt === 'string' ? doc.updatedAt : null,
      urls: {
        docs: toAbsoluteUrl(docsSet.routeBase, origin),
        product: toAbsoluteUrl(docsSet.productRoute, origin),
      },
    },
  }
}

const compareProjects = (first: ListedProject, second: ListedProject): number =>
  first.groupOrder - second.groupOrder ||
  compareText(first.project.group?.title ?? '', second.project.group?.title ?? '') ||
  first.order - second.order ||
  compareText(first.project.title, second.project.title) ||
  compareText(first.project.slug, second.project.slug)

const findProjects = async ({
  slug,
  docsGroupsCollectionSlug,
  docsSetsCollectionSlug,
  req,
  trustForwardedHeaders,
}: {
  req: PayloadRequest
  slug?: string
} & CreateDocsProjectsEndpointsOptions): Promise<ListedProject[]> => {
  const [docsSets, groups] = await Promise.all([
    req.payload.find({
      collection: docsSetsCollectionSlug,
      depth: 1,
      draft: false,
      overrideAccess: true,
      pagination: false,
      req,
      ...(slug === undefined ? {} : { where: { slug: { equals: slug } } }),
    }),
    req.payload.find({
      collection: docsGroupsCollectionSlug,
      depth: 0,
      overrideAccess: true,
      pagination: false,
      req,
    }),
  ])
  const groupsById = indexDocsGroupsById(groups.docs)
  const origin = getPublicRequestOrigin(req, { trustForwardedHeaders })

  return docsSets.docs
    .flatMap((doc) => {
      const listed = toListedProject({ doc, groupsById, origin })

      return listed ? [listed] : []
    })
    .sort(compareProjects)
}

const matchesEtag = (header: null | string, etag: string): boolean =>
  header !== null &&
  header
    .split(',')
    .map((value) => value.trim().replace(/^W\//, ''))
    .some((value) => value === '*' || value === etag)

/**
 * JSON response whose strong ETag is the SHA-256 of the exact body, so any change to any
 * listed record (including additions, removals, group or URL changes) changes it.
 */
const cachedJsonResponse = (req: PayloadRequest, body: unknown, status = 200): Response => {
  const text = JSON.stringify(body)
  const etag = `"${createHash('sha256').update(text).digest('base64url')}"`
  const headers = {
    'Cache-Control': CACHE_CONTROL,
    ETag: etag,
  }

  if (status === 200 && matchesEtag(req.headers.get('if-none-match'), etag)) {
    return new Response(null, { headers, status: 304 })
  }

  return new Response(text, {
    headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' },
    status,
  })
}

const getSearchParam = (req: PayloadRequest, name: string): string[] => {
  const searchParams =
    req.searchParams ??
    (() => {
      try {
        return new URL(req.url ?? '', 'http://localhost').searchParams
      } catch {
        return new URLSearchParams()
      }
    })()

  return searchParams
    .getAll(name)
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean)
}

export const createDocsProjectsEndpoints = (options: CreateDocsProjectsEndpointsOptions): Endpoint[] => {
  const path = options.path ?? DEFAULT_DOCS_PROJECTS_ENDPOINT_PATH

  return [
    {
      handler: async (req) => {
        const groupFilter = new Set(getSearchParam(req, 'group'))
        const projects = (await findProjects({ ...options, req }))
          .map(({ project }) => project)
          .filter((project) => groupFilter.size === 0 || (project.group && groupFilter.has(project.group.slug)))
        const groups = new Map<string, DocsProjectsGroup>()

        for (const project of projects) {
          if (project.group && !groups.has(project.group.slug)) {
            groups.set(project.group.slug, project.group)
          }
        }

        return cachedJsonResponse(req, {
          groups: [...groups.values()],
          projects,
          schemaVersion: DOCS_PROJECTS_SCHEMA_VERSION,
        } satisfies DocsProjectsListResponse)
      },
      method: 'get',
      path,
    },
    {
      handler: async (req) => {
        const routeParams = (req as { routeParams?: Record<string, unknown> }).routeParams
        const slug = typeof routeParams?.slug === 'string' ? routeParams.slug : ''
        const project = slug ? (await findProjects({ ...options, slug, req }))[0]?.project : undefined

        if (!project) {
          return cachedJsonResponse(
            req,
            {
              error: { code: 'not_found', message: `No published docs set has the slug "${slug}".` },
              schemaVersion: DOCS_PROJECTS_SCHEMA_VERSION,
            } satisfies DocsProjectsErrorResponse,
            404,
          )
        }

        return cachedJsonResponse(req, {
          project,
          schemaVersion: DOCS_PROJECTS_SCHEMA_VERSION,
        } satisfies DocsProjectResponse)
      },
      method: 'get',
      path: `${path}/:slug`,
    },
  ]
}
