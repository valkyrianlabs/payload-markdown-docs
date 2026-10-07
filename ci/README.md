# CI infrastructure

Build, test, Playwright, native CLI and release-tooling steps run inside a disposable rootless
Podman container on the self-hosted runner; the runner itself has no host sudo, host `apt` or
Docker access. The design, mounts, privileges, caches and the host broker (`ci-host`) are
documented once, in payload-markdown's
[`ci/README.md`](https://github.com/valkyrianlabs/payload-markdown/blob/main/ci/README.md).

- `ci/run-ci` is a verbatim copy of payload-markdown's (repository-agnostic: image
  `localhost/payload-markdown-docs-ci`, caches under `~/.cache/payload-markdown-docs-ci`).
- `ci/Containerfile` is this repository's image: the Playwright 1.58.2 noble image (pinned by
  digest) plus Node (`.nvmrc`), pnpm (`packageManager`), the native CLI's Meson/CMake toolchain
  and libraries, Debian packaging tools, Ruby and Python. `/workspace/.venv/bin` (created by
  `.github/scripts/setup-release-python.sh`) is first on `PATH`.

Workflows make `./ci/run-ci` each self-hosted job's default shell, so `run:` blocks are plain
commands:

```yaml
defaults:
  run:
    shell: bash ./ci/run-ci bash -euo pipefail {0}
```

Steps that need Postgres use `bash ./ci/run-ci --postgres bash -euo pipefail {0}`; the
clean-install smoke tests use a digest-pinned stock image:
`bash ./ci/run-ci --image docker.io/library/ubuntu:24.04@sha256:… --root bash -euo pipefail {0}`.

Locally (with Podman): `ci/run-ci pnpm test:int`, `ci/run-ci --postgres pnpm test:e2e`.
