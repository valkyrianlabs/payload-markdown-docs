# Sync Safety Model

The sync workflow is authenticated and server-owned.

Important concepts:

- `source.id` maps to a Payload Admin docs set.
- The docs set owns the route base and source-specific auth policy.
- The manifest does not choose target collections or fields.
- `sync.allowWrites: true` is required for `mode: "sync"`.
- `sync.allowPublish: true` and `target.enableDrafts: true` are required for publishing.
- `sync.allowHardDelete: true` is required for hard delete.
- Archive is safer than delete.
- Manual edit conflicts abort before writes.

Ed25519 signed pushes verify:

- key id
- timestamp skew
- nonce replay
- body SHA-256
- Ed25519 signature
- manifest validity

GitHub OIDC pushes verify:

- bearer JWT signature through GitHub JWKS
- issuer and audience
- repository, owner, ref, workflow, and environment allowlists from the docs set
- pull request policy
- JWT `jti` replay protection
- body SHA-256
- manifest validity

Do not bypass failed auth or body verification. Fix the key, endpoint, docs set,
source id, body, or server config.
