<!--
vl-release staged release notes: the user-facing story of the NEXT release.
Maintained continuously while working; `vlr prepare` promotes it into the release notes
history (and the GitHub release) and resets this file to this template.

Format: the first line is "# <release title>" WITHOUT a version number (vlr adds it).
Everything after the title is the Markdown release body. Describe the resulting behavior
for users and operators; keep it representative of what actually ships.
-->

# APT signing key updates arrive through upgrades

`pmdocs` now recommends `valkyrianlabs-archive-keyring`, the package that carries the Valkyrian Labs
APT repository's signing key. Installing `pmdocs` from the repository installs it (APT installs
recommended packages by default), and from then on any change
to the key (such as the removal of its expiry date) reaches the machine through normal upgrades
instead of a manual re-download.

- The package owns `/usr/share/keyrings/valkyrianlabs.gpg`. An unmodified copy of the key at
  `/etc/apt/keyrings/valkyrianlabs.gpg` (the path the installation docs used) is replaced by a link to
  it, so existing `signed-by=` source lines keep working unchanged; a modified file is left alone.
- It is a recommendation, not a hard dependency, so the standalone `.deb` from a GitHub release still
  installs on a system without the repository configured. On machines that already have `pmdocs`,
  install the keyring once with `sudo apt install valkyrianlabs-archive-keyring`.
