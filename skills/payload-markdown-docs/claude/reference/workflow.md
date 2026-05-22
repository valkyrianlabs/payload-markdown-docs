# Agent Docs Workflow

Use this workflow when editing docs source files.

1. Inspect the docs tree, usually `{{docsRoot}}`.
2. Edit Markdown files in place.
3. Keep frontmatter valid and simple.
4. Keep internal docs links root-relative.
5. Use the sibling `payload-markdown` skill for directive syntax and formatting.
6. Run validation.
7. Run plan when sync impact matters.
8. Only push when the user asks for upload/sync and provides endpoint/auth context.

Validation:

```bash
{{packageManager}} exec payload-markdown-docs validate --source main-docs
```

Plan:

```bash
{{packageManager}} exec payload-markdown-docs plan --source main-docs
```

Use `--docs {{docsRoot}}` only when the docs source is not the conventional
`./docs` directory.

Sync with GitHub OIDC:

```bash
{{packageManager}} exec payload-markdown-docs push \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source main-docs \
  --github-oidc
```

Explicit dry-run:

```bash
{{packageManager}} exec payload-markdown-docs push \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source main-docs \
  --github-oidc \
  --dry-run
```

Use Ed25519 key flags only when the project is not using GitHub OIDC:

```bash
{{packageManager}} exec payload-markdown-docs push \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source main-docs \
  --key-id github-actions-main \
  --private-key-env DOCS_SYNC_PRIVATE_KEY
```

Use `--publish` only when the user explicitly asks for published output and the
server supports publishing.

Do not directly edit generated Payload docs records unless the user specifically
asks for Payload-side overrides.
