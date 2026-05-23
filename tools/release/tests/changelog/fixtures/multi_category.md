# Release Draft: 1.3.0

- Previous tag: `v1.2.5`
- HEAD: `abcabca`
- Commits in range: 3
- Release-note entries: 3

## Debian
- Evidence: weak (commits: 1, files: 1, snippets: 0, delta: +2/-1)
- Themes: `packaging`
- Signal: low-confidence category; changes appear metadata-only or sparse.
- Key commits:
  - Update package install paths (`1111111`)
- Top files:
  - `debian/install` (+2/-1, score 6.2)
- Snippets: none extracted; file-level evidence only.

## Tools
- Evidence: weak (commits: 1, files: 1, snippets: 0, delta: +8/-4)
- Themes: `release-automation`
- Signal: low-confidence category; changes appear metadata-only or sparse.
- Key commits:
  - Refine release snippet scoring (`2222222`)
- Top files:
  - `tools/release/changelog/scoring.py` (+8/-4, score 8.6)
- Snippets: none extracted; file-level evidence only.

## Core
- Evidence: weak (commits: 1, files: 1, snippets: 0, delta: +9/-3)
- Themes: `core`
- Signal: low-confidence category; changes appear metadata-only or sparse.
- Key commits:
  - Tune sync task retry behavior (`9999999`)
- Top files:
  - `core/src/sync/tasks/Runner.cpp` (+9/-3, score 7.1)
- Snippets: none extracted; file-level evidence only.
