---
title: Troubleshooting
description: Common validation, signing, sync, route, and environment issues.
order: 635
status: published
tags:
  - reference
  - troubleshooting
---

# Troubleshooting

:::toc {title="On this page" depth="3" theme="compact"}
:::

## `invalid_signature`

The signature does not match the canonical request string. Check the key id, private key, endpoint URL pathname, timestamp, nonce, and exact JSON body.

## `body_hash_mismatch`

The `X-VL-MD-DOCS-Body-SHA256` header does not match the request body. Sign and send the exact same body string.

## `nonce_replay`

The nonce was already accepted for the same key id. Generate a fresh nonce by rerunning `push`.

## `oidc_invalid_token`

The GitHub OIDC JWT is malformed, uses an unsupported algorithm, has an invalid signature, or cannot be verified with GitHub's current signing keys.

## `oidc_invalid_audience`

The token audience does not match the docs set slug. Use a CLI source that
matches the docs set slug. In GitHub Actions workflows, pass that source
explicitly instead of relying on repository-name inference.

## `oidc_repository_not_allowed`

The token repository is not trusted. Check GitHub OIDC records in
`Docs Globals > Access`, especially the owner, `limitRepos`, and repository
list.

## `oidc_ref_not_allowed`

The token `ref` does not match the docs set branch.

## `oidc_pull_request_not_allowed`

Pull request events are rejected by default. This keeps PR-originated workflows from applying docs sync unless the server explicitly opts in.

## `oidc_replay`

The token `jti` was already accepted. Rerun the workflow so GitHub issues a fresh OIDC token.

## `source_not_allowed`

The manifest source did not resolve to a docs set slug. Create a docs set
with the expected slug or pass the correct `--source` value.

## `publish_disabled`

The request asked to publish, but the server does not have `sync.allowPublish: true`.

## `hard_delete_disabled`

The effective delete behavior is `delete`, but the server does not have `sync.allowHardDelete: true`.

## `route_collision`

The generated docs route conflicts with another docs route or an opt-in Pages collision check.

## `manual_edit_conflict`

A generated docs record changed outside the docs sync workflow. The sync aborts before writes to avoid overwriting human edits.

## Public `/llms.txt` Or Skill Route 404

If `/api/llms.txt` or a Payload API skill asset URL works but the public route
outside `/api` returns HTML 404, the consuming Next app is missing the public
asset route files. Run:

```bash
pmdocs install routes --payload-app "src/app/(payload)"
```

Commit and deploy the generated files, then purge any cached 404 responses.

## Asset Schema Missing

If an asset route or sync response says the docs assets schema is missing, the
`payload-markdown-docs-assets` collection table has not been created yet. Run
the Payload migration/dev flow against that database before syncing or serving
static docs assets.

## Postgres In Tests

The dev integration tests use PostgreSQL. In restricted sandboxes, Vitest may need permission to connect to the local test database.

:::callout {variant="warning" title="Do not ignore auth failures"}
Auth and body verification errors should be fixed at the key, endpoint, or request level. Do not disable authentication to make CI pass.
:::
