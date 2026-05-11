import Link from 'next/link'
import React from 'react'

import type { DocsGroup, DocsSet } from '../../payload-types'

import { deriveDocsSetRouteBase, joinRouteSegments } from '@valkyrianlabs/payload-markdown-docs'

type CMSLinkType = {
  appearance?: 'inline'
  children?: React.ReactNode
  className?: string
  label?: null | string
  newTab?: boolean | null
  reference?:
    | {
        relationTo: 'docs-groups'
        value: DocsGroup | number | string
      }
    | {
        relationTo: 'docs-sets'
        value: DocsSet | number | string
      }
    | null
  type?: 'custom' | 'reference' | null
  url?: null | string
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isDocsGroup = (ref: unknown): ref is DocsGroup =>
  isObject(ref) && typeof ref.slug === 'string' && typeof ref.title === 'string'

const isDocsSet = (ref: unknown): ref is DocsSet =>
  isObject(ref) && typeof ref.slug === 'string' && typeof ref.title === 'string'

const getDocsGroupHref = (group: DocsGroup): string =>
  joinRouteSegments(
    isDocsGroup(group.parent) ? getDocsGroupHref(group.parent) : undefined,
    group.slug,
  )

const getDocsSetHref = (docsSet: DocsSet): string =>
  deriveDocsSetRouteBase({
    docsSetSlug: docsSet.slug,
    groupRoutePath: isDocsGroup(docsSet.group) ? getDocsGroupHref(docsSet.group) : undefined,
  })

export const CMSLink: React.FC<CMSLinkType> = ({
  type,
  children,
  className,
  label,
  newTab,
  reference,
  url,
}) => {
  let href: null | string = url || null

  if (type === 'reference') {
    const ref = reference?.value

    if (reference?.relationTo === 'docs-groups' && isDocsGroup(ref)) {
      href = getDocsGroupHref(ref)
    }

    if (reference?.relationTo === 'docs-sets' && isDocsSet(ref)) {
      href = getDocsSetHref(ref)
    }
  }

  if (!href) {
    return null
  }

  const newTabProps = newTab ? { rel: 'noopener noreferrer', target: '_blank' } : {}

  return (
    <Link className={className} href={href} {...newTabProps}>
      {label}
      {children}
    </Link>
  )
}
