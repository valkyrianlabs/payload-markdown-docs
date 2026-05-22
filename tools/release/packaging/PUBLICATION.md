# Debian Publication and Live APT Validation

This document defines the Phase 12 publication boundary and the follow-up
validation seam for live APT install testing.

## CI publication contract

Release workflow publication is driven by:

- `RELEASE_PUBLISH_MODE` (`disabled` or `nexus`)
- `NEXUS_REPO_URL`
- `NEXUS_USER`
- `NEXUS_PASS`

The workflow always runs the publication command:

```bash
python3 -m tools.release publish-deb --output-dir <artifact_dir>
```

Behavior:

- `RELEASE_PUBLISH_MODE=disabled`: publication is skipped with explicit logs.
- `RELEASE_PUBLISH_MODE=nexus`: publication is required and fails fast if:
  - Nexus credentials/config are missing
  - no `.deb` artifacts exist in the release output directory
  - Nexus upload fails for any selected artifact

No runner-local environment sourcing is used in canonical CI publication logic.

## Artifact selection

`publish-deb` publishes deterministic Debian artifacts from the staged release
output directory:

- all files matching `*.deb` (sorted deterministically)

This keeps selection explicit and aligned to the package action output contract.

## Phase 12b live APT validation seam

After publication is complete, live install validation should run against the
real repository endpoint, not local files. Suggested validation flow:

1. Provision a clean Debian/Ubuntu target.
2. Configure APT source list to the published Nexus/APT endpoint.
3. Run:
   - `apt update`
   - `apt install vaulthalla`
4. Verify:
   - package dependency resolution
   - `vaulthalla-web.service` starts correctly
   - web runtime payload exists at `/usr/share/vaulthalla-web`
   - maintainer-script lifecycle semantics for remove/purge
5. Execute upgrade validation:
   - publish a newer package revision
   - `apt upgrade vaulthalla`
   - verify service/runtime continuity and expected script behavior
