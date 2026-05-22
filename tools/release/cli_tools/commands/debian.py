import argparse
import os
from pathlib import Path

from tools.release.packaging import build_debian_package, validate_release_artifacts, \
    resolve_debian_publication_settings, publish_debian_artifacts


def cmd_build_deb(args: argparse.Namespace) -> int:
    repo_root = Path(args.repo_root).resolve()
    result = build_debian_package(
        repo_root=repo_root,
        output_dir=args.output_dir,
        dry_run=args.dry_run,
    )

    print("Debian build plan")
    print("----------------")
    print(f"Repo root:   {result.repo_root}")
    print(f"Package:     {result.package_name}")
    print(f"Version:     {result.package_version}")
    print(f"Output dir:  {result.output_dir}")
    print(f"Command:     {' '.join(result.command)}")

    if result.dry_run:
        print("\nDry run only. No Debian build command was executed.")
        return 0

    print()
    print("Artifacts")
    print("---------")
    for artifact in result.artifacts:
        print(f"- {artifact}")
    if result.build_log is not None:
        print(f"\nBuild log: {result.build_log}")

    return 0


def cmd_validate_release_artifacts(args: argparse.Namespace) -> int:
    repo_root = Path(args.repo_root).resolve()
    output_dir = Path(args.output_dir)
    if not output_dir.is_absolute():
        output_dir = (repo_root / output_dir).resolve()

    result = validate_release_artifacts(
        output_dir=output_dir,
        require_changelog=not bool(args.skip_changelog),
    )
    print("Release artifact validation")
    print("---------------------------")
    print(f"Output dir:        {result.output_dir}")
    print(f"Debian artifacts:  {len(result.debian_artifacts)}")
    print(f"Web artifacts:     {len(result.web_artifacts)}")
    if not args.skip_changelog:
        print(f"Changelog files:   {len(result.changelog_artifacts)}")
    print("Status:            OK")
    return 0


def cmd_publish_deb(args: argparse.Namespace) -> int:
    repo_root = Path(args.repo_root).resolve()
    output_dir = Path(args.output_dir)
    if not output_dir.is_absolute():
        output_dir = (repo_root / output_dir).resolve()

    settings = resolve_debian_publication_settings(
        mode=args.mode,
        nexus_repo_url=args.nexus_repo_url,
        nexus_user=args.nexus_user,
        nexus_password=args.nexus_pass,
        env=os.environ,
    )
    result = publish_debian_artifacts(
        output_dir=output_dir,
        settings=settings,
        dry_run=bool(args.dry_run),
        require_enabled=bool(args.require_enabled),
    )

    print("Debian publication")
    print("------------------")
    print(f"Publication required: {'yes' if args.require_enabled else 'no'}")
    print(f"Mode:              {result.mode}")
    print("Upload mode:       post-binary-to-base-url")
    print("Append filename:   no")
    print(f"Output dir:        {result.output_dir}")
    print(f"Debian artifacts:  {len(result.artifacts)}")
    for artifact in result.artifacts:
        print(f"- {artifact}")

    if not result.enabled:
        print("Status:            SKIPPED")
        print(f"Reason:            {result.skipped_reason or 'Publication disabled.'}")
        return 0

    print(f"Target URLs:       {len(result.target_urls)}")
    for target_url in result.target_urls:
        print(f"- {target_url}")

    if result.dry_run:
        print("Status:            DRY-RUN (validated, not uploaded)")
    else:
        print("Status:            PUBLISHED")
    return 0
