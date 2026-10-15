import type { Config, Field } from 'payload'

import fs from 'node:fs'
import path from 'node:path'

/**
 * payload-markdown is published under two names from one build: `payload-markdown` (preferred)
 * and `@valkyrianlabs/payload-markdown`. Either satisfies this plugin. Config-time code never
 * imports it: the markdown field is plain field config whose admin component path names the
 * installed package, so it is built here for whichever name the app has.
 */
export const PAYLOAD_MARKDOWN_PACKAGES = ['payload-markdown', '@valkyrianlabs/payload-markdown'] as const

export type PayloadMarkdownPackageName = (typeof PAYLOAD_MARKDOWN_PACKAGES)[number]

/** Same default as payload-markdown's `markdownField()` (DEFAULT_MARKDOWN_MAX_LENGTH). */
const DEFAULT_MARKDOWN_MAX_LENGTH = 1_000_000

/** Field-level `custom` key payload-markdown (and its MCP tools) use to recognise markdown fields. */
const PAYLOAD_MARKDOWN_FIELD_CUSTOM_KEY = 'payloadMarkdownField'

const COMPONENT_PATH_PATTERN = /^((?:@valkyrianlabs\/)?payload-markdown)\/(?:client|server)#/

/** The payload-markdown name used by component paths already in the config (its plugin adds some). */
function findPackageInConfig(value: unknown, seen = new Set<unknown>()): PayloadMarkdownPackageName | undefined {
  if (typeof value === 'string') {
    return value.match(COMPONENT_PATH_PATTERN)?.[1] as PayloadMarkdownPackageName | undefined
  }

  if (!value || typeof value !== 'object' || seen.has(value)) {
    return undefined
  }

  seen.add(value)

  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    const found = findPackageInConfig(child, seen)

    if (found) {
      return found
    }
  }

  return undefined
}

/** The payload-markdown name installed for the app, resolved upwards from `cwd` like Node does. */
export function findInstalledPayloadMarkdownPackage(cwd = process.cwd()): PayloadMarkdownPackageName | undefined {
  let directory = path.resolve(cwd)

  while (true) {
    for (const name of PAYLOAD_MARKDOWN_PACKAGES) {
      if (fs.existsSync(path.join(directory, 'node_modules', name, 'package.json'))) {
        return name
      }
    }

    const parent = path.dirname(directory)

    if (parent === directory) {
      return undefined
    }

    directory = parent
  }
}

/**
 * Which payload-markdown package the app uses: the explicit option, else the name in component
 * paths payload-markdown's plugin already put into the config (list `payloadMarkdown()` before
 * `payloadMarkdownDocs()`), else the installed package, else `payload-markdown`.
 */
export function resolvePayloadMarkdownPackage(
  config: Pick<Config, 'blocks' | 'collections' | 'globals'>,
  explicit?: PayloadMarkdownPackageName,
): PayloadMarkdownPackageName {
  return (
    explicit ??
    findPackageInConfig([config.blocks, config.collections, config.globals]) ??
    findInstalledPayloadMarkdownPackage() ??
    'payload-markdown'
  )
}

export type PayloadMarkdownFieldOptions = {
  label?: string
  name: string
  packageName: PayloadMarkdownPackageName
}

/** Equivalent of payload-markdown's `markdownField()` for the given installed package name. */
export function payloadMarkdownField({ name, label = 'Markdown', packageName }: PayloadMarkdownFieldOptions): Field {
  return {
    name,
    type: 'text',
    admin: {
      components: {
        Field: `${packageName}/server#PayloadMarkdownField`,
      },
    },
    custom: { [PAYLOAD_MARKDOWN_FIELD_CUSTOM_KEY]: true },
    label,
    localized: false,
    maxLength: DEFAULT_MARKDOWN_MAX_LENGTH,
    required: false,
  }
}
