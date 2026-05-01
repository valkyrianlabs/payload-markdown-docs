# Troubleshooting

## Invalid signature

Check key id, private key, endpoint pathname, timestamp, nonce, and exact body string.

## Body hash mismatch

The signed body is not the body that was sent. Sign and send the exact same JSON string.

## Nonce replay

Generate a fresh request. Do not reuse signed headers.

## Source not allowed

Create or update a docs set with the expected `sourceId`, or update server fallback sources.

## Publish disabled

The server needs `sync.allowPublish: true` and a draft-enabled docs collection.

## Hard delete disabled

Hard delete requires `sync.allowHardDelete: true`. Prefer archive unless the user explicitly needs deletion.

## Route collision

A generated docs route overlaps another docs route or an opt-in Pages collision check.

## Manual edit conflict

A generated docs record was edited outside the docs sync workflow. The sync aborts before writes.

## Invalid frontmatter

Use only supported fields and simple YAML.

## Non-root-relative link

Internal docs links should look like `/workflow/signed-push`, not `workflow/signed-push` or a production URL.
