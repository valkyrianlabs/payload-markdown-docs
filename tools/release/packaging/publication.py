from __future__ import annotations

import os
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Mapping
from urllib.parse import urlparse

DEFAULT_PUBLICATION_MODE = "disabled"
SUPPORTED_PUBLICATION_MODES: tuple[str, ...] = ("disabled", "nexus")


@dataclass(frozen=True)
class DebianPublicationSettings:
    mode: str
    nexus_repo_url: str
    nexus_user: str
    nexus_password: str


@dataclass(frozen=True)
class DebianPublicationResult:
    output_dir: Path
    mode: str
    enabled: bool
    dry_run: bool
    artifacts: tuple[Path, ...]
    target_urls: tuple[str, ...]
    skipped_reason: str | None = None


def resolve_debian_publication_settings(
    *,
    mode: str | None = None,
    nexus_repo_url: str | None = None,
    nexus_user: str | None = None,
    nexus_password: str | None = None,
    env: Mapping[str, str] | None = None,
) -> DebianPublicationSettings:
    environment = os.environ if env is None else env

    resolved_mode = (mode or environment.get("RELEASE_PUBLISH_MODE", DEFAULT_PUBLICATION_MODE)).strip().lower()
    if resolved_mode not in SUPPORTED_PUBLICATION_MODES:
        supported = ", ".join(SUPPORTED_PUBLICATION_MODES)
        raise ValueError(f"Unsupported release publication mode `{resolved_mode}`. Supported values: {supported}.")

    resolved_repo_url = (nexus_repo_url or environment.get("NEXUS_REPO_URL", "")).strip()
    resolved_user = (nexus_user or environment.get("NEXUS_USER", "")).strip()
    resolved_password = (nexus_password or environment.get("NEXUS_PASS", "")).strip()

    if resolved_mode == "nexus":
        missing: list[str] = []
        if not resolved_repo_url:
            missing.append("NEXUS_REPO_URL")
        if not resolved_user:
            missing.append("NEXUS_USER")
        if not resolved_password:
            missing.append("NEXUS_PASS")
        if missing:
            rendered = ", ".join(missing)
            raise ValueError(
                "Debian publication mode is `nexus` but required Nexus configuration is missing: "
                f"{rendered}."
            )
        _validate_nexus_repo_url(resolved_repo_url)

    return DebianPublicationSettings(
        mode=resolved_mode,
        nexus_repo_url=resolved_repo_url,
        nexus_user=resolved_user,
        nexus_password=resolved_password,
    )


def select_debian_publication_artifacts(*, output_dir: Path | str) -> tuple[Path, ...]:
    destination = Path(output_dir).resolve()
    if not destination.is_dir():
        raise ValueError(
            "Debian publication failed: output directory does not exist "
            f"or is not a directory: {destination}"
        )

    artifacts = _find_debian_publication_artifacts(destination)
    if not artifacts:
        raise ValueError(
            "Debian publication failed: no Debian package artifacts were found "
            f"under {destination} (*.deb)."
        )
    return artifacts


def publish_debian_artifacts(
    *,
    output_dir: Path | str,
    settings: DebianPublicationSettings,
    dry_run: bool = False,
    require_enabled: bool = False,
    uploader: Callable[[Path, str, str, str], None] | None = None,
) -> DebianPublicationResult:
    destination = Path(output_dir).resolve()

    if settings.mode == "disabled":
        if require_enabled:
            raise ValueError(
                "Debian publication is required for this run, but RELEASE_PUBLISH_MODE is disabled."
            )
        artifacts = _find_debian_publication_artifacts(destination)
        return DebianPublicationResult(
            output_dir=destination,
            mode=settings.mode,
            enabled=False,
            dry_run=dry_run,
            artifacts=artifacts,
            target_urls=(),
            skipped_reason="Publication mode is disabled.",
        )

    if settings.mode != "nexus":
        raise ValueError(f"Unsupported release publication mode: {settings.mode}")

    artifacts = select_debian_publication_artifacts(output_dir=destination)
    upload = _upload_file_to_nexus_with_curl if uploader is None else uploader
    target_url = settings.nexus_repo_url
    target_urls = tuple(target_url for _ in artifacts)
    if not dry_run:
        for artifact, target_url in zip(artifacts, target_urls):
            upload(artifact, target_url, settings.nexus_user, settings.nexus_password)

    return DebianPublicationResult(
        output_dir=destination,
        mode=settings.mode,
        enabled=True,
        dry_run=dry_run,
        artifacts=artifacts,
        target_urls=target_urls,
        skipped_reason=None,
    )


def _validate_nexus_repo_url(repo_url: str) -> None:
    parsed = urlparse(repo_url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError(
            "NEXUS_REPO_URL must be an absolute http(s) URL, "
            f"received `{repo_url}`."
        )


def _find_debian_publication_artifacts(destination: Path) -> tuple[Path, ...]:
    if not destination.is_dir():
        return ()
    return tuple(
        sorted(
            path
            for path in destination.iterdir()
            if path.is_file() and path.name.endswith(".deb")
        )
    )


def _upload_file_to_nexus_with_curl(
    artifact: Path,
    target_url: str,
    username: str,
    password: str,
) -> None:
    try:
        completed = subprocess.run(
            (
                "curl",
                "--fail",
                "--silent",
                "--show-error",
                "--retry",
                "3",
                "--retry-all-errors",
                "--connect-timeout",
                "10",
                "--max-time",
                "300",
                "--user",
                f"{username}:{password}",
                "-H",
                "Content-Type: multipart/form-data",
                "--data-binary",
                f"@{artifact}",
                target_url,
            ),
            text=True,
            capture_output=True,
            check=False,
        )
    except FileNotFoundError as exc:
        raise ValueError(
            "Debian publication failed: `curl` is not installed or not on PATH."
        ) from exc
    except Exception as exc:
        raise ValueError(
            f"Debian publication failed while uploading {artifact.name} to {target_url}: {exc}"
        ) from exc

    if completed.returncode != 0:
        stderr = _tail_lines(completed.stderr, limit=20)
        raise ValueError(
            "Debian publication failed: Nexus upload returned a non-zero exit code "
            f"for {artifact.name} -> {target_url} "
            f"(upload_mode=post-binary-to-base-url, append_filename=no, exit {completed.returncode}).\n{stderr}"
        )


def _tail_lines(content: str, *, limit: int) -> str:
    lines = [line for line in content.splitlines() if line.strip()]
    if not lines:
        return "(no stderr output)"
    return "\n".join(lines[-limit:])
