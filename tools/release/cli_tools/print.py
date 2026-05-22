import sys

from tools.release.version.models import Version

def print_release_state(state) -> None:
    print("Release state")
    print("-------------")
    print(f"Repo root:         {state.paths.repo_root}")
    print(f"VERSION:           {format_value(state.versions.canonical)}")
    print(f"meson.build:       {format_value(state.versions.meson)}")
    print(f"package.json:      {format_value(state.versions.package_json)}")
    print(f"debian/changelog:  {format_value(state.versions.debian)}")
    print(f"Status:            {'OK' if state.is_valid else 'INVALID'}")

    if state.issues:
        print("\nIssues:")
        for issue in state.issues:
            print(f"  - [{issue.code}] {issue.message}")


def print_planned_changes(
    *,
    current_canonical,
    current_meson,
    current_package_json,
    current_debian,
    target_version: Version,
    target_debian_revision: int,
) -> None:
    print("Planned changes")
    print("---------------")
    print(f"VERSION:           {format_value(current_canonical)} -> {target_version}")
    print(f"meson.build:       {format_value(current_meson)} -> {target_version}")
    print(f"package.json:      {format_value(current_package_json)} -> {target_version}")
    print(
        f"debian/changelog:  {format_value(current_debian)} -> "
        f"{target_version}-{target_debian_revision}"
    )


def format_value(value) -> str:
    return str(value) if value is not None else "<unavailable>"


def print_status(line: str) -> None:
    sys.stdout.write(f"{line}\n")
    sys.stdout.flush()
