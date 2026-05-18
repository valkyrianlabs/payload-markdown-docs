import { withPayload } from '@payloadcms/next/withPayload'

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['mongodb-memory-server'],
  images: {
    dangerouslyAllowLocalIP: true,
    localPatterns: [
      {
        pathname: '/preview/**'
      }
    ]
  }
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
