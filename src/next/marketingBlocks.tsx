import type { ReactNode } from 'react'

import type {
  DocsAssetReference,
  DocsBannerProps,
  DocsCalloutProps,
  DocsCTAProps,
  DocsMarketingFetch,
  DocsMarketingPayloadBlockProps,
  DocsMarketingPayloadOperations,
  DocsPageReference,
  DocsPreviewProps,
  DocsRelationship,
  DocsSetReference,
  DocsWhere,
  SkillCTAGroupInput,
} from '../marketing/types.js'

import { DocsBanner as DocsBannerView } from '../components/docs/DocsBanner.js'
import { DocsCallout as DocsCalloutView } from '../components/docs/DocsCallout.js'
import { DocsCTA as DocsCTAView } from '../components/docs/DocsCTA.js'
import { DocsPreview as DocsPreviewView } from '../components/docs/DocsPreview.js'
import {
  DEFAULT_DOCS_ASSETS_COLLECTION_SLUG,
  DEFAULT_DOCS_COLLECTION_SLUG,
  DEFAULT_DOCS_SETS_COLLECTION_SLUG,
} from '../constants.js'
import { resolveDocsSetSkills } from '../utilities/index.js'
import {
  getDocsPageTitle,
  getDocsRelationshipId,
  getDocsSetTitle,
  getText,
  getTypedDocsPageHref,
  getTypedDocsSetPublicHref,
} from '../utilities/normalizeShared.js'

type FindArgs = Parameters<NonNullable<DocsMarketingPayloadOperations['find']>>[0]
type FindByIDArgs = Parameters<DocsMarketingPayloadOperations['findByID']>[0]
type DocsFindResponse = {
  docs?: DocsAssetReference[]
}

const trimTrailingSlashes = (value: string): string => value.replace(/\/+$/, '')

const normalizeRoutePrefix = (value: null | string | undefined): string => {
  const routePrefix = getText(value) ?? '/api'
  const withLeadingSlash = routePrefix.startsWith('/') ? routePrefix : `/${routePrefix}`

  return trimTrailingSlashes(withLeadingSlash)
}

const getEnvironmentOrigin = (): string | undefined => {
  const configuredOrigin =
    getText(process.env.PAYLOAD_PUBLIC_SERVER_URL) ??
    getText(process.env.NEXT_PUBLIC_SERVER_URL) ??
    getText(process.env.SERVER_URL)

  if (configuredOrigin) {
    return trimTrailingSlashes(configuredOrigin)
  }

  const vercelURL = getText(process.env.VERCEL_URL)

  return vercelURL ? `https://${trimTrailingSlashes(vercelURL)}` : undefined
}

const getAPIBaseURL = (props: DocsMarketingPayloadBlockProps): string => {
  const routePrefix = normalizeRoutePrefix(props.apiRoutePrefix)
  const explicitBaseURL = getText(props.apiBaseURL)

  if (explicitBaseURL?.startsWith('http://') || explicitBaseURL?.startsWith('https://')) {
    return trimTrailingSlashes(explicitBaseURL)
  }

  if (explicitBaseURL?.startsWith('/')) {
    return trimTrailingSlashes(explicitBaseURL)
  }

  const origin = getEnvironmentOrigin()

  return origin ? `${trimTrailingSlashes(origin)}${routePrefix}` : routePrefix
}

const getFetchForProps = (
  props: DocsMarketingPayloadBlockProps,
): DocsMarketingFetch | undefined => props.fetch ?? globalThis.fetch

const appendWhereParams = (
  params: URLSearchParams,
  where: DocsWhere,
  prefix = 'where',
): void => {
  for (const [key, value] of Object.entries(where)) {
    const nextPrefix = `${prefix}[${key}]`

    if (Array.isArray(value)) {
      value.forEach((item, index) => appendWhereParams(params, item, `${nextPrefix}[${index}]`))
      continue
    }

    const condition = value

    if (condition.equals !== undefined) {
      params.set(`${nextPrefix}[equals]`, String(condition.equals))
    }
  }
}

const fetchJSON = async <TData,>({
  fetchFn,
  url,
}: {
  fetchFn: DocsMarketingFetch
  url: string
}): Promise<TData | undefined> => {
  const response = await fetchFn(url, {
    headers: {
      accept: 'application/json',
    },
  })

  if (!response.ok) {
    return undefined
  }

  return response.json() as Promise<TData>
}

const createRestPayloadOperations = (
  props: DocsMarketingPayloadBlockProps,
): DocsMarketingPayloadOperations | undefined => {
  const apiBaseURL = getAPIBaseURL(props)
  const fetchFn = getFetchForProps(props)

  if (!fetchFn) {
    return undefined
  }

  return {
    find: async (args: FindArgs): Promise<{ docs: DocsAssetReference[] }> => {
      const searchParams = new URLSearchParams()

      if (args.depth !== undefined) {
        searchParams.set('depth', String(args.depth))
      }

      if (args.limit !== undefined) {
        searchParams.set('limit', String(args.limit))
      }

      if (args.sort) {
        searchParams.set('sort', args.sort)
      }

      if (args.where) {
        appendWhereParams(searchParams, args.where)
      }

      const query = searchParams.size > 0 ? `?${searchParams.toString()}` : ''
      const result = await fetchJSON<DocsFindResponse>({
        fetchFn,
        url: `${apiBaseURL}/${args.collection}${query}`,
      })

      return {
        docs: result?.docs ?? [],
      }
    },
    findByID: (args: FindByIDArgs) => {
      const searchParams = new URLSearchParams()

      if (args.depth !== undefined) {
        searchParams.set('depth', String(args.depth))
      }

      const query = searchParams.size > 0 ? `?${searchParams.toString()}` : ''

      return fetchJSON<DocsPageReference | DocsSetReference>({
        fetchFn,
        url: `${apiBaseURL}/${args.collection}/${encodeURIComponent(args.id)}${query}`,
      }).then((result) => result ?? null)
    },
  }
}

const getPayloadForProps = (
  props: DocsMarketingPayloadBlockProps,
): DocsMarketingPayloadOperations | undefined =>
  props.payload ?? createRestPayloadOperations(props)

const shouldHydrateDocsSet = (
  docsSet: DocsRelationship<DocsSetReference> | null | undefined,
): boolean => Boolean(getDocsRelationshipId(docsSet) && (!getDocsSetTitle(docsSet) || !getTypedDocsSetPublicHref(docsSet)))

const shouldHydrateDocsPage = (
  docsPage: DocsRelationship<DocsPageReference> | null | undefined,
): boolean => Boolean(getDocsRelationshipId(docsPage) && (!getDocsPageTitle(docsPage) || !getTypedDocsPageHref(docsPage)))

const shouldResolveSkills = (skills: null | SkillCTAGroupInput | undefined): boolean =>
  skills?.enabled === true

const resolveDocsSet = async ({
  docsSet,
  payload,
  props,
}: {
  docsSet: DocsRelationship<DocsSetReference> | null | undefined
  payload?: DocsMarketingPayloadOperations
  props: DocsMarketingPayloadBlockProps
}): Promise<DocsRelationship<DocsSetReference> | null | undefined> => {
  if (!shouldHydrateDocsSet(docsSet) || !payload) {
    return docsSet
  }

  const id = getDocsRelationshipId(docsSet)

  if (!id) {
    return docsSet
  }

  return payload.findByID({
    id,
    collection: props.collections?.docsSets ?? DEFAULT_DOCS_SETS_COLLECTION_SLUG,
    depth: 2,
    overrideAccess: true,
  })
}

const resolveDocsPage = async ({
  docsPage,
  payload,
  props,
}: {
  docsPage: DocsRelationship<DocsPageReference> | null | undefined
  payload?: DocsMarketingPayloadOperations
  props: DocsMarketingPayloadBlockProps
}): Promise<DocsRelationship<DocsPageReference> | null | undefined> => {
  if (!shouldHydrateDocsPage(docsPage) || !payload) {
    return docsPage
  }

  const id = getDocsRelationshipId(docsPage)

  if (!id) {
    return docsPage
  }

  return payload.findByID({
    id,
    collection: props.collections?.docs ?? DEFAULT_DOCS_COLLECTION_SLUG,
    depth: 1,
    overrideAccess: true,
  })
}

const resolveSkills = async ({
  docsSet,
  payload,
  props,
  skills,
}: {
  docsSet: DocsRelationship<DocsSetReference> | null | undefined
  payload?: DocsMarketingPayloadOperations
  props: DocsMarketingPayloadBlockProps
  skills: null | SkillCTAGroupInput | undefined
}): Promise<SkillCTAGroupInput | undefined> => {
  if (!payload?.find) {
    return skills ?? undefined
  }

  return resolveDocsSetSkills({
    collectionSlug: props.collections?.docsAssets ?? DEFAULT_DOCS_ASSETS_COLLECTION_SLUG,
    docsSet,
    payload: {
      find: payload.find,
    },
    skills,
  })
}

const resolveDocsSetBlockProps = async <
  TProps extends DocsBannerProps | DocsCTAProps | DocsPreviewProps,
>(
  props: TProps,
): Promise<TProps> => {
  const payload =
    shouldHydrateDocsSet(props.docsSet) || shouldResolveSkills(props.skills)
      ? getPayloadForProps(props)
      : undefined
  const docsSet = await resolveDocsSet({
    docsSet: props.docsSet,
    payload,
    props,
  })
  const skills = await resolveSkills({
    docsSet,
    payload,
    props,
    skills: props.skills,
  })

  return {
    ...props,
    docsSet,
    skills,
  }
}

export const DocsBanner = async (props: DocsBannerProps): Promise<ReactNode> => {
  const resolvedProps = await resolveDocsSetBlockProps(props)

  return <DocsBannerView {...resolvedProps} />
}

export const DocsCTA = async (props: DocsCTAProps): Promise<ReactNode> => {
  const resolvedProps = await resolveDocsSetBlockProps(props)

  return <DocsCTAView {...resolvedProps} />
}

export const DocsPreview = async (props: DocsPreviewProps): Promise<ReactNode> => {
  const resolvedProps = await resolveDocsSetBlockProps(props)

  return <DocsPreviewView {...resolvedProps} />
}

export const DocsCallout = async (props: DocsCalloutProps): Promise<ReactNode> => {
  const payload =
    shouldHydrateDocsSet(props.docsSet) ||
    shouldHydrateDocsPage(props.docsPage) ||
    shouldResolveSkills(props.skills)
      ? getPayloadForProps(props)
      : undefined
  const docsSet = await resolveDocsSet({
    docsSet: props.docsSet,
    payload,
    props,
  })
  const docsPage = await resolveDocsPage({
    docsPage: props.docsPage,
    payload,
    props,
  })
  const skills = await resolveSkills({
    docsSet,
    payload,
    props,
    skills: props.skills,
  })

  return <DocsCalloutView {...props} docsPage={docsPage} docsSet={docsSet} skills={skills} />
}
