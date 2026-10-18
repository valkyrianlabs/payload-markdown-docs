# @valkyrianlabs/payload-markdown-docs-consumer

Lists the projects published by one or more
[payload-markdown-docs](https://github.com/valkyrianlabs/payload-markdown-docs) sites, such as
docs sets with their docs group, SEO metadata, canonical URLs and categorized technology stack.
A portfolio or landing site can configure its sources once and render every external project,
with no CMS duplication and no per-project registration.

- No dependencies: it uses `fetch`, and pulls in no Payload, Next.js, React or Markdown packages.
- Supports multiple sites, each with multiple docs groups and docs sets. Results are segmented
  by site, then by group, and are also available as one flat list.
- Validates the wire contract at runtime (`schemaVersion`), so a site that runs an
  incompatible payload-markdown-docs version shows up as an error instead of as bad data.
- Partial failures are observable: an unreachable site never hides the others, and the result
  says whether the results are complete.

## Enable the API on each docs site

In each site's Payload config:

```ts
payloadMarkdownDocs({
  publicApi: { projects: true },
})
```

This serves `GET /api/documentation/projects` and `GET /api/documentation/projects/:slug`,
which list every published docs set. Agents keep each project's stack in `docs/stack.toml`,
and `pmdocs` syncs it.

## Use

```sh
pnpm add @valkyrianlabs/payload-markdown-docs-consumer
```

```ts
import { createDocsProjectsClient } from '@valkyrianlabs/payload-markdown-docs-consumer'

export const projectsClient = createDocsProjectsClient({
  sites: [
    { id: 'vaulthalla', baseUrl: 'https://vaulthalla.io' },
    { id: 'valkyrianlabs', baseUrl: 'https://valkyrianlabs.com' },
  ],
  // Optional: passed to every fetch (Next.js data cache, headers, ...).
  fetchOptions: { next: { revalidate: 300, tags: ['external-projects'] } },
})

const result = await projectsClient.getProjects()

for (const site of result.sites) {
  if (!site.ok) {
    console.warn(`${site.id} is unavailable: ${site.error.message}`)
    continue
  }

  for (const group of site.groups) {
    // group.key is "<siteId>/<groupSlug>", for example "valkyrianlabs/libraries"
    for (const project of group.projects) {
      // project.key is "<siteId>/<slug>": unique across sites even when slugs repeat
      console.log(project.key, project.seo.title, project.urls.product)
    }
  }

  for (const project of site.ungrouped) {
    console.log(project.key)
  }
}

// One grid of everything: site order, then each site's own order.
result.projects

// False when any site failed; result.errors lists them.
result.complete
```

Filter by site or by docs group (group slugs apply on every site), or fetch one project:

```ts
await projectsClient.getProjects({ sites: ['valkyrianlabs'], groups: ['libraries', 'tools'] })

const one = await projectsClient.getProject('vaulthalla', 'vaulthalla')
if (one.ok) {
  one.project.stack
} else if (one.error.code === 'not_found') {
  // not published on that site
}
```

### Rendering the stack

Each project's `stack` keeps the categories and their order from `docs/stack.toml`:

```ts
import { flattenStack, formatStackCategory } from '@valkyrianlabs/payload-markdown-docs-consumer'

project.stack
// [{ category: 'languages', items: [{ name: 'C++23' }, { name: 'TypeScript' }] }, ...]

flattenStack(project.stack) // ['C++23', 'TypeScript', 'libfuse3', ...] for one row of pills
formatStackCategory('machine-learning') // 'Machine Learning'
```

Categories are free-form keys chosen by each project, so render them generically.

### Storing projects in your own Payload

To keep a `projects` collection on your own site, store a reference such as `site` + `slug`
(or `key`) and read the rest from the client when rendering. Use the canonical
`project.urls.product` and `project.urls.docs` as given; never rebuild them.

## Options

| Option | Default | |
| --- | --- | --- |
| `sites` | required | `{ id, baseUrl, apiPath?, fetchOptions? }[]` in display order. `id` scopes every key. |
| `fetch` | `globalThis.fetch` | Injectable `fetch`. |
| `fetchOptions` | none | Passed to every request. Per-site `fetchOptions` and headers override it. |
| `timeoutMs` | `10000` | Per request. `0` disables it. |

Site errors carry a `code`:

| Code | Meaning |
| --- | --- |
| `network` | The request failed. |
| `timeout` | No response within `timeoutMs`. |
| `http` | The site answered with a non-200 status, for example 404 when `publicApi.projects` is not enabled. |
| `invalid_json` | The response was not JSON. |
| `schema_missing` | The response is JSON but not from the projects API. |
| `schema_unsupported` | The site serves a newer, incompatible schema version. |
| `invalid_response` | The response does not match the schema. |
| `not_found` | `getProject` only: the project is not published on that site. |

A project entry that does not match the schema is skipped and reported in that site's
`warnings`.

## Compatibility

Sites update payload-markdown-docs on their own schedules, so compatibility is decided by the
response's `schemaVersion`, not by npm versions. This release understands schema version 1.
Within a schema version fields are only added, and this client ignores fields it does not know.
The package is released together with payload-markdown-docs and carries the same version
number.

## License

MIT
