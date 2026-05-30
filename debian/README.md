# Debian Packaging

This directory is a packaging skeleton for the native `pmdocs` CLI only. It is
intended for Valkyrian Labs' own Nexus-backed apt repository, not for Debian
proper.

Build locally from the repository root on a Debian-like system with:

```bash
sudo apt install build-essential cmake debhelper doctest-dev libcli11-dev libcurl4-openssl-dev libssl-dev meson ninja-build nlohmann-json3-dev pkgconf
dpkg-buildpackage -us -uc -b
```

The release helper wraps the same package build and copies artifacts into
`release/`:

```bash
python3 -m tools.release changelog release \
  --output release/changelog.release.md \
  --raw-output release/changelog.raw.md \
  --payload-output release/changelog.payload.json \
  --semantic-payload-output release/changelog.semantic_payload.json \
  --context-output release/changelog.context.json \
  --selection-output release/changelog.selection.json
python3 -m tools.release build-deb --output-dir release
python3 -m tools.release validate-release-artifacts --output-dir release
```

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

The optional npm parity harness is not part of Debian package builds. Run it
from a normal repository checkout with:

```bash
meson setup build-parity -Dnative_cli_parity_tests=true
meson test -C build-parity
```

Protected CI publication to Nexus is controlled by `RELEASE_PUBLISH_MODE`,
`NEXUS_REPO_URL`, `NEXUS_USER`, and `NEXUS_PASS`. Local and workflow-dispatch
dry-runs keep publication disabled so release tooling tests do not upload
artifacts accidentally.
