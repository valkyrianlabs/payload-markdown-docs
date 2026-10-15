/**
 * npm name of this copy of the package. One build is published under two names, the scoped
 * one in package.json and the unscoped `payload-markdown-docs` (release.toml
 * `[[npm.aliases]]`). The alias tarball differs from the canonical one only in package.json
 * `name` and in this file, so code that must refer to the package by name (Payload admin
 * component paths, which the app's import map resolves) uses this constant.
 *
 * Keep the canonical name out of comments here: the alias rewrites every occurrence in the
 * compiled file.
 */
export const PAYLOAD_MARKDOWN_DOCS_PACKAGE: string = '@valkyrianlabs/payload-markdown-docs'
