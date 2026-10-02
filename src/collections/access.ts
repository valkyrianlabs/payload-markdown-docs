import type { Access, CollectionConfig, PayloadRequest } from 'payload'

/**
 * Default access control for plugin collections (DOCS-6).
 *
 * Without explicit `access`, Payload allows every authenticated user of every auth
 * collection to create, read, update, and delete. In apps with a customer/member auth
 * collection that let any logged-in member register their own Ed25519 sync key, delete
 * replay nonces, or edit docs. The defaults below restrict the plugin collections to
 * admin users (users of `config.admin.user`, or `access.admin` when configured).
 *
 * The sync endpoint and the public read side use the Local API with
 * `overrideAccess: true`, so these rules only affect REST/GraphQL/admin access.
 */

export type CollectionAccessOverrides = CollectionConfig['access']

export type DocsCollectionAccessProfile = 'admin' | 'audit'

const getAdminUserCollection = (req: PayloadRequest): string | undefined => {
  const config = req.payload?.config as { admin?: { user?: unknown } } | undefined
  const adminUser = config?.admin?.user

  return typeof adminUser === 'string' ? adminUser : undefined
}

/** Default admin check: a logged-in user from the Payload admin user collection. */
export const isDocsAdminUser: Access = ({ req }) => {
  const user = req?.user as { collection?: unknown } | null | undefined

  if (!user) {
    return false
  }

  const adminUserCollection = getAdminUserCollection(req)

  return adminUserCollection !== undefined && user.collection === adminUserCollection
}

const denyAll: Access = () => false

/**
 * Applies default access to a plugin collection.
 *
 * - `admin` profile: admins may create, read, update, and delete.
 * - `audit` profile (nonces, sync runs): read-only for admins; records are only written
 *   by the sync endpoint through the Local API.
 *
 * Per-collection overrides (`collections.<key>.access`) replace individual operations.
 */
export const withDocsCollectionAccess = ({
  admin = isDocsAdminUser,
  collection,
  overrides,
  profile,
}: {
  admin?: Access
  collection: CollectionConfig
  overrides?: CollectionAccessOverrides
  profile: DocsCollectionAccessProfile
}): CollectionConfig => {
  const defaults: NonNullable<CollectionConfig['access']> =
    profile === 'admin'
      ? {
          create: admin,
          delete: admin,
          read: admin,
          readVersions: admin,
          update: admin,
        }
      : {
          create: denyAll,
          delete: denyAll,
          read: admin,
          update: denyAll,
        }

  return {
    ...collection,
    access: {
      ...defaults,
      ...collection.access,
      ...overrides,
    },
  }
}
