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

The native test suite covers command parsing, `doctor`, `skill install`, and the
offline `validate`, `manifest`, and `plan` commands.

## npm parity tests

The npm CLI remains the reference implementation until each native command has
reached parity. The optional parity harness runs native `pmdocs` and
`pnpm --silent cli` against the same local fixtures and compares structured JSON
outputs.

Run parity checks in a separate build directory when Node dependencies are
installed:

```bash
meson setup build-parity -Dnative_cli_parity_tests=true
meson compile -C build-parity
meson test -C build-parity
```

The parity harness is intentionally opt-in so normal native builds stay usable
in non-npm repositories and packaging environments.

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

## Phase 2 scope

The native CLI currently supports the offline workflow:

- `pmdocs doctor`
- `pmdocs skill install`
- `pmdocs validate`
- `pmdocs manifest`
- `pmdocs plan`

Do not add HTTP, auth, OIDC, Ed25519 signing, OpenSSL, curl, yaml-cpp, or other
network/protocol dependencies in Phase 2. Those belong to the next phase after
the local manifest and plan behavior is reviewed.
