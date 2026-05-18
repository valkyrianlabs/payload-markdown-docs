import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'

export const revalidatePage: CollectionAfterChangeHook = ({ doc }) => doc

export const revalidateDelete: CollectionAfterDeleteHook = ({ doc }) => doc
