from __future__ import annotations

from tools.release.version.adapters import DebianVersion, write_debian_version, write_meson_version, write_package_json_version, write_version_file
from tools.release.version.models import Version
from tools.release.version.validate import ReleasePaths


def resolve_debian_revision(
    *,
    explicit_revision: int | None,
    current_debian: DebianVersion | None,
    default_revision: int = 1,
) -> int:
    if explicit_revision is not None:
        return explicit_revision
    if current_debian is not None:
        return current_debian.revision
    return default_revision


def apply_version_update(
    *,
    paths: ReleasePaths,
    version: Version,
    debian_revision: int,
    write_canonical: bool,
) -> None:
    if write_canonical:
        write_version_file(paths.version_file, version)

    write_meson_version(paths.meson_file, version)
    write_package_json_version(paths.package_json_file, version)
    write_debian_version(paths.debian_changelog_file, version, revision=debian_revision)
