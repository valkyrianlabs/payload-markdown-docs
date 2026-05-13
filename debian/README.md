# Debian Packaging

This directory is a packaging skeleton for the native `pmdocs` CLI only. It is
intended for Valkyrian Labs' own Nexus-backed apt repository, not for Debian
proper.

Build locally from the repository root on a Debian-like system with:

```bash
sudo apt install build-essential cmake debhelper doctest-dev libcli11-dev meson ninja-build nlohmann-json3-dev pkgconf
dpkg-buildpackage -us -uc -b
```

Meson installs the binary and bundled skill data. Maintainer scripts should stay
empty unless a future package genuinely needs system state migration.
