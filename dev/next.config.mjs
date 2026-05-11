import { withPayload } from '@payloadcms/next/withPayload'

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['mongodb-memory-server'],
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
