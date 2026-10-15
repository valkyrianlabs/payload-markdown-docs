# Payload Markdown Docs release notes

<!-- vl-release:entry version=1.1.0 -->
## 1.1.0 — Security and Correctness Stabilization

_Released 2026-10-02_

Sync security defaults to admin-only access, scopes credentials to docs sets and rejects nonce replays; sync apply is transactional and protects manual edits; draft docs and docs sets stay off public surfaces (llms.txt, sitemap, marketing blocks); `pmdocs` refuses plain-http endpoints, enforces the server's body limit and reports route collisions; apps without a media collection are supported. Full notes: [v1.1.0 on GitHub](https://github.com/valkyrianlabs/payload-markdown-docs/releases/tag/v1.1.0) and the [1.1 upgrade guide](https://github.com/valkyrianlabs/payload-markdown-docs/blob/v1.1.0/docs/reference/migration.md).
