# Docs sync contract vectors

The docs sync protocol is implemented twice:

- the **server** (authoritative): TypeScript in `src/sync/*` and
  `src/security/*`;
- the **native CLI** `pmdocs`: C++ in `cli/src/docs.cpp`, which builds,
  validates, plans, signs and uploads manifests before the server sees them.

Every behaviour both sides must agree on is pinned by the JSON files in
`vectors/`. The same files run from:

| Side | Runner | Command |
|---|---|---|
| TypeScript | `src/sync/contracts.spec.ts` | `pnpm exec vitest --run src/sync` |

When the two implementations disagree, the server's behaviour is the contract
(it decides what is accepted). Change a vector only together with both
implementations, and only when the server behaviour is meant to change.

## Format and versioning

Each file is a JSON object with `contractVersion` (currently `1`), a
`description`, and one or more case arrays. Every case has inputs and an
`expect` object. Bump `contractVersion` in every file when a vector's meaning
(not just its content) changes; runners assert the version they understand.

| File | Pins |
|---|---|
| `routes.json` | docs path normalization, `index` stripping (ASCII case-insensitive), slug replacement, route-base prefix stripping, unservable/whitespace route segments |
| `titles.json` | title inference from the first H1, filename fallback, frontmatter title precedence |
| `frontmatter.json` | the supported YAML subset, issue/warning codes **and messages**, body content |
| `asset-routes.json` | asset route derivation and confinement of client-supplied routes |
| `manifests.json` | whole-manifest validation (issue/warning codes and paths, in order), derived routes/titles, in-manifest route collisions |
| `signing.json` | SHA-256, canonical signing string, endpoint path extraction, deterministic Ed25519 request signatures (RFC 8032 test key in PEM, base64 DER and OpenSSH form) |
| `limits.json` | compact JSON request-body serialization (byte length and SHA-256) and the body-size decision |
| `content-types.json` | the asset content-type allowlist and extension mapping |
| `utf8.json` | strict UTF-8 validity |

## Contract rules (version 1)

### Text

- A leading UTF-8 BOM (U+FEFF) is removed before frontmatter detection; parsed
  content never starts with a BOM.
- Line endings are CRLF, lone CR or LF.
- "Trim" means `String.prototype.trim` (ECMAScript whitespace and line
  terminators, including NBSP and U+FEFF).

### Frontmatter

- Frontmatter starts when the first line is exactly `---` and ends at the next
  line that trims to `---`. A missing closing line is an error.
- Top-level lines are `key: value`; keys match `[A-Za-z_][A-Za-z0-9_-]*`.
  Known fields: `title`, `navTitle`, `description`, `order`, `draft`, `status`,
  `slug`, `tags`, `dependencies`, `redirectFrom`. Other keys produce a warning
  and are ignored together with everything indented below them.
- Full-line `#` comments are ignored. Trailing ` # ...` text is part of the
  value (no inline comments).
- One pair of matching outer quotes (`"..."` or `'...'`, length >= 2) is
  removed; escapes are not interpreted.
- List fields accept `- item` lines or a single-line flow list `[a, "b, c"]`
  (no nesting, a trailing comma is allowed, empty items are not).
- Nested or multi-line values and YAML block scalars (`|`, `>`) on known fields
  are errors; they never override other fields.
- `order` uses ECMAScript `Number()` semantics on the unquoted value: decimal
  numbers, unsigned `0x`/`0o`/`0b` integers; the result must be finite. An empty
  value is `0` with a warning. `0x1p3`, `-0x10`, `1_000`, `Infinity` are errors.
- `slug` must match `[A-Za-z0-9][A-Za-z0-9-]*`; an empty slug is ignored with a
  warning. `draft` is `true`/`false`; `status` is `draft`/`published`.
- An empty `title` is kept in the frontmatter but ignored for the page title
  (warning).

### Routes

- Paths are relative, use `/` (backslashes are converted), may start with
  `./`, must not contain empty, `.` or `..` segments, and must end in lowercase
  `.md`.
- A final `index` segment is removed, compared ASCII case-insensitively
  (`index.md`, `Index.md` and `INDEX.md` all map to their directory).
- Leading path segments equal to the route base segments are stripped
  (case-sensitive); then a `slug` replaces the last segment (except `index` on
  an index file).
- Route segments containing `?`, `#` or a control character (U+0000-U+001F,
  U+007F-U+009F) are errors (`invalid_route`); segments containing other
  whitespace are warnings (`route_whitespace`).
- Two entries deriving the same route are an `exact_route_collision` (the sync
  endpoint answers `route_collision`); routes equal up to ASCII letter case are a
  `case_insensitive_route_collision` (reported as a warning by `pmdocs`).

### Titles

The page title is the frontmatter `title` when non-empty, else the first
top-level level-1 heading, else a filename-derived title.

- ATX (`# Title`, up to three leading spaces, `#` followed by space, tab or end
  of line, optional closing `#` sequence preceded by space) and setext
  (`Title` + `===`) headings count. Fenced code (backtick/tilde), indented code
  (4+ columns), blockquotes and list items are skipped.
- Inline markup is stripped: code spans keep their content, links/images keep
  label/alt text, autolinks keep their target, backslash escapes are resolved,
  and matched `*`, `_`, `~` delimiter runs of equal length (CommonMark flanking
  rules, ASCII-only whitespace/punctuation classes) are removed. Raw HTML and
  entities are kept as written.
- The filename fallback splits the file (or, for `index.md`, directory) name on
  `-`, `_` and whitespace and upper-cases the first UTF-16 code unit of each
  part with `String.prototype.toUpperCase` (so astral characters are unchanged);
  an empty result becomes `Untitled`.

### Assets

- `skill` routes are always derived from the docs set
  (`<assetRouteBase>/skills/<path below skills/<source>/>`); a client route is
  ignored with an `asset_route_ignored` warning when it differs.
- `llms`/`llms-full` routes must be `/llms.txt`/`/llms-full.txt` or that file
  directly under the asset route base.
- `static` routes must be the asset route base or below it.
- Client routes must not contain `.`/`..` segments, `%`, `?`, `#` or control
  characters (`invalid_asset_route`).
- Clients emit only `text/markdown`, `application/json`, `application/yaml` and
  `text/plain`, each with `; charset=utf-8`, chosen by extension.

### Size

The binding limit is the UTF-8 byte length of the compact JSON request body;
the server answers 413 when it exceeds `maxBodyBytes` (default 5,000,000).
Clients must measure the exact body they send. JSON serialization is
byte-identical on both sides (`JSON.stringify` and nlohmann `dump()`: only `"`,
`\` and control characters are escaped, non-ASCII is emitted raw).

### Encoding

Docs and asset files must be valid UTF-8 (WHATWG strict decoding).
