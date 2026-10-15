<!--
vl-release staged changelog: package-facing changes for the NEXT release.
Maintained continuously while working; `vlr prepare` renders it into debian/changelog
and resets this file to this template.

Format: one "- " bullet per change (concise, technical). Indent continuation lines.
Optional "## Section" headings group bullets; if used, every bullet must be under one.
One level of nested "  - " detail bullets is allowed. Consolidate; don't paste commit logs.
-->
- Always bundle and install the payload-markdown skill next to payload-markdown-docs.
  - Vendored in skills/payload-markdown, so every build ships it, Homebrew included.
  - pmdocs install skill prefers the project's node_modules/payload-markdown (either
    package name) and fails when neither copy is available.
- Add pmdocs skill check and pmdocs skill update; installed skills carry a skill.json
  manifest. validate and plan warn on stderr when the installed skill is outdated.
- pmdocs install routes imports the plugin under the package name the app depends on.
- Build with vl-release; the Homebrew formula builds from the release source archive.
