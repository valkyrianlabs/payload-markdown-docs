declare module '@payload-config' {
  import type { SanitizedConfig } from 'payload'

  const config: Promise<SanitizedConfig> | SanitizedConfig

  export default config
}
