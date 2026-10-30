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
`validate` / `manifest` / `plan` (including `stack.toml` project metadata),
`keygen`, and pre-network `push` behavior.
`meson test` also runs `pmdocs contract vectors`, which executes the shared
TS/C++ protocol vectors in `../contracts/vectors/` against
`src/sync_contract.cpp` (see `../contracts/README.md`). Keep protocol logic in
`src/sync_contract.cpp` and change it only together with `src/sync/*` and the
vectors.

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
`nlohmann_json`, `CLI11`, `toml++` (reading `docs/stack.toml`; Debian/Ubuntu
`libtomlplusplus-dev`, Homebrew `tomlplusplus`) and `doctest`, following
[Phase 3 Dependency Plan](./PHASE3_DEPENDENCIES.md). Live endpoint push/OIDC
coverage still belongs in protected smoke tests, not routine local tests.

The build asks Meson for C++23 and falls back to C++20 (`cpp_std=c++23,c++20`
in the top-level `meson.build`), and sets no minimum macOS version. The oldest
toolchain it must build with is the macOS 15 SDK's libc++, which Homebrew uses
on Sequoia. That libc++ lacks some library features newer SDKs have, notably
floating-point `std::from_chars`, so parse numbers with `strtod_l` in the "C"
locale instead. The Homebrew workflow builds on macOS 15 (arm64 and Intel) to
catch regressions.
