# Sync Safety Model

The sync workflow is signed and server-owned.

Important concepts:

- `source.id` maps to a configured docs set or allowed source.
- The docs set owns the route base.
- The manifest does not choose target collections or fields.
- `sync.allowWrites: true` is required for `mode: "sync"`.
- `sync.allowPublish: true` and `target.enableDrafts: true` are required for publishing.
- `sync.allowHardDelete: true` is required for hard delete.
- Archive is safer than delete.
- Manual edit conflicts abort before writes.

Signed pushes verify:

- key id
- timestamp skew
- nonce replay
- body SHA-256
- Ed25519 signature
- manifest validity

Do not bypass failed auth or body verification. Fix the key, endpoint, source id, body, or server config.
