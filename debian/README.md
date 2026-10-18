# Debian Packaging

This directory is a packaging skeleton for the native `pmdocs` CLI only. It is
intended for Valkyrian Labs' own Nexus-backed apt repository, not for Debian
proper.

Build locally from the repository root on a Debian-like system with:

```bash
sudo apt install build-essential cmake debhelper doctest-dev libcli11-dev libcurl4-openssl-dev libssl-dev libtomlplusplus-dev meson ninja-build nlohmann-json3-dev pkgconf
dpkg-buildpackage -us -uc -b
```

Releases build the package with vl-release (`release.toml` `[debian]`), which
copies the prepared tree into `build/deb/src`, runs `dpkg-buildpackage` there and
checks the package contract (required skill files, byte-identical copies of the
work tree's skills):

```bash
vlr prepare --dry-run   # preview the debian/changelog stanza from .release/CHANGELOG_NEXT.md
vlr build-deb
vlr validate-artifacts
```

`debian/changelog` is published history: only `vlr prepare` (release CI) adds to
it. Describe package changes in `.release/CHANGELOG_NEXT.md` instead.

Smoke-check the resulting package before publishing to the internal apt
repository:

```bash
dpkg -c ../pmdocs_*.deb | grep -E 'usr/bin/pmdocs|usr/share/pmdocs/skills/payload-markdown(-docs)?'
sudo apt install ./release/pmdocs_<version>-1_<arch>.deb
pmdocs --version
pmdocs doctor
pmdocs validate ./dev/docs-fixtures/basic --source payload-markdown-docs
pmdocs skill install --dry-run
```

Meson installs the binary and bundled skill data. Maintainer scripts should stay
empty unless a future package genuinely needs system state migration.

Package builds run the native Meson test suite (`meson test`), which includes
the shared TS/C++ protocol contract vectors under `contracts/vectors/`. There is
no separate npm parity harness; the TypeScript side runs the same vectors from
`pnpm exec vitest --run`.

Release CI publishes with `vlr publish-deb --require-enabled`, gated by
`RELEASE_PUBLISH_MODE` (`nexus`) and the `NEXUS_APT_REPO` (or `NEXUS_REPO_URL`),
`NEXUS_USER` and `NEXUS_PASSWORD` (or `NEXUS_PASS`) settings; it skips a
package the repository already has with identical bytes and refuses different
ones. Workflow-dispatch dry-runs never publish.
