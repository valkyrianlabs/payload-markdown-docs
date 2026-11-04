<!--
vl-release staged changelog: package-facing changes for the NEXT release.
Maintained continuously while working; `vlr prepare` renders it into debian/changelog
and resets this file to this template.

Format: one "- " bullet per change (concise, technical). Indent continuation lines.
Optional "## Section" headings group bullets; if used, every bullet must be under one.
One level of nested "  - " detail bullets is allowed. Consolidate; don't paste commit logs.
-->
- Parse numeric frontmatter values with strtod_l in the "C" locale instead of
  floating-point std::from_chars, which the macOS 15 SDK's libc++ lacks.
- Report stack.toml syntax errors as invalid_stack_toml validation issues on macOS too: catch
  toml++ parse errors through their std::runtime_error base and match toml::parse_error by type
  name, since the toml++ shared library does not export that class's type_info and libc++abi
  compares type_info by address. Also handle toml++ built without exceptions (parse_result).
- Make the route-collision and skill-path unit tests pass on case-insensitive filesystems and
  where the temp directory is behind a symlink, and run the meson tests in the macOS CI jobs.
