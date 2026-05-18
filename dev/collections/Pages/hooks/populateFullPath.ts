import type { CollectionBeforeChangeHook } from 'payload'

export const populateFullPath: CollectionBeforeChangeHook = ({ data }) => {
  const slug = typeof data?.slug === 'string' ? data.slug.trim() : ''

  data.fullPath = slug ? `/${slug.replace(/^\/+/, '')}` : '/'

  return data
}
