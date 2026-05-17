import type { ReactNode } from 'react'

import type {
  DocsAssetReference,
  DocsBannerProps,
  DocsCalloutProps,
  DocsCTAProps,
  DocsMarketingPayloadBlockProps,
  DocsMarketingPayloadOperations,
  DocsPageReference,
  DocsPreviewProps,
  DocsRelationship,
  DocsSetReference,
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
  getTypedDocsPageHref,
  getTypedDocsSetPublicHref,
} from '../utilities/normalizeShared.js'

let payloadPromise: Promise<DocsMarketingPayloadOperations | undefined> | undefined

type FindArgs = Parameters<NonNullable<DocsMarketingPayloadOperations['find']>>[0]
type FindByIDArgs = Parameters<DocsMarketingPayloadOperations['findByID']>[0]

const getConfiguredPayload = async (): Promise<DocsMarketingPayloadOperations | undefined> => {
  if (!payloadPromise) {
    payloadPromise = Promise.all([import('payload'), import('@payload-config')])
      .then(async ([payloadModule, payloadConfigModule]) => {
        const payload = await payloadModule.getPayload({
          config: payloadConfigModule.default,
        })

        return {
          find: async (args: FindArgs): Promise<{ docs: DocsAssetReference[] }> => {
            const result = await payload.find(args)

            return {
              docs: result.docs as DocsAssetReference[],
            }
          },
          findByID: (args: FindByIDArgs) => payload.findByID(args),
        }
      })
      .catch(() => undefined)
  }

  return payloadPromise
}

const getPayloadForProps = async (
  props: DocsMarketingPayloadBlockProps,
): Promise<DocsMarketingPayloadOperations | undefined> => props.payload ?? getConfiguredPayload()

const shouldHydrateDocsSet = (
  docsSet: DocsRelationship<DocsSetReference> | null | undefined,
): boolean => Boolean(getDocsRelationshipId(docsSet) && (!getDocsSetTitle(docsSet) || !getTypedDocsSetPublicHref(docsSet)))

const shouldHydrateDocsPage = (
  docsPage: DocsRelationship<DocsPageReference> | null | undefined,
): boolean => Boolean(getDocsRelationshipId(docsPage) && (!getDocsPageTitle(docsPage) || !getTypedDocsPageHref(docsPage)))

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
  const payload = await getPayloadForProps(props)
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
  const payload = await getPayloadForProps(props)
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
