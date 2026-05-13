# Debian Packaging

This directory is a packaging skeleton for the native `pmdocs` CLI only. It is
intended for Valkyrian Labs' own Nexus-backed apt repository, not for Debian
proper.

Build locally from the repository root on a Debian-like system with:

```bash
sudo apt install build-essential cmake debhelper doctest-dev libcli11-dev meson ninja-build nlohmann-json3-dev pkgconf
dpkg-buildpackage -us -uc -b
```

Smoke-check the resulting package contents before publishing to the internal apt
repository:

```bash
dpkg -c ../pmdocs_*.deb | grep -E 'usr/bin/pmdocs|usr/share/pmdocs/skills/payload-markdown-docs'
```

Meson installs the binary and bundled skill data. Maintainer scripts should stay
empty unless a future package genuinely needs system state migration.

The optional npm parity harness is not part of Debian package builds. Run it
from a normal repository checkout with:

```bash
meson setup build-parity -Dnative_cli_parity_tests=true
meson test -C build-parity
```
