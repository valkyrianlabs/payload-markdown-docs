<!--
vl-release staged changelog: package-facing changes for the NEXT release.
Maintained continuously while working; `vlr prepare` renders it into debian/changelog
and resets this file to this template.

Format: one "- " bullet per change (concise, technical). Indent continuation lines.
Optional "## Section" headings group bullets; if used, every bullet must be under one.
One level of nested "  - " detail bullets is allowed. Consolidate; don't paste commit logs.
-->

- Depend on valkyrianlabs-archive-keyring so renewed APT signing-key metadata reaches existing installs
  through upgrades (it owns /usr/share/keyrings/valkyrianlabs.gpg and links an unmodified
  /etc/apt/keyrings/valkyrianlabs.gpg to it).
