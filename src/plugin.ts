import type { Config, Plugin } from 'payload'

import type { PayloadMarkdownDocsConfig } from './types.js'

export const payloadMarkdownDocs =
  (pluginOptions: PayloadMarkdownDocsConfig = {}): Plugin =>
  (incomingConfig: Config): Config => {
    if (pluginOptions.enabled === false) {
      return incomingConfig
    }

    return {
      ...incomingConfig,
    }
  }
