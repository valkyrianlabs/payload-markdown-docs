# Native CLI Development

This directory contains the native `pmdocs` CLI. Meson builds this CLI only; it
does not build the npm/Payload package.

## Native-only build and tests

Use this path when working on C++ code that should not require Node, pnpm, or
`node_modules`:

```bash
meson setup build
meson compile -C build
meson test -C build
```

The native test suite covers command parsing, `doctor`, `skill install`, local
`validate` / `manifest` / `plan`, `keygen`, and pre-network `push` behavior.

## Install smoke check

Use `--destdir` to verify Meson install rules without writing to system paths:

```bash
meson install -C build --destdir "$PWD/stage"
PMDOCS_DATA_DIR="$PWD/stage/usr/local/share/pmdocs" \
  "$PWD/stage/usr/local/bin/pmdocs" doctor
```

The `PMDOCS_DATA_DIR` override is for development and tests. A real installed
binary uses the Meson-compiled data directory, such as
`/usr/local/share/pmdocs` or `/usr/share/pmdocs`.

## Current scope

The native CLI currently supports:

- `pmdocs doctor`
- `pmdocs install skill`
- `pmdocs skill install` compatibility alias
- `pmdocs install routes`
- `pmdocs validate`
- `pmdocs manifest`
- `pmdocs plan`
- `pmdocs keygen`
- `pmdocs push`

The native remote workflow uses direct `libcurl`, OpenSSL 3 EVP APIs,
`nlohmann_json`, `CLI11`, and `doctest`, following
[Phase 3 Dependency Plan](./PHASE3_DEPENDENCIES.md). Live endpoint push/OIDC
coverage still belongs in protected smoke tests, not routine local tests.
