from __future__ import annotations

import re
from dataclasses import dataclass


SEMVER_PATTERN = re.compile(r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$")


@dataclass(frozen=True, order=True)
class Version:
    major: int
    minor: int
    patch: int

    def __post_init__(self) -> None:
        for field_name in ("major", "minor", "patch"):
            value = getattr(self, field_name)
            if not isinstance(value, int):
                raise TypeError(f"{field_name} must be an int, got {type(value).__name__}")
            if value < 0:
                raise ValueError(f"{field_name} must be >= 0, got {value}")

    @classmethod
    def parse(cls, raw: str) -> "Version":
        if not isinstance(raw, str):
            raise TypeError(f"Version string must be str, got {type(raw).__name__}")

        normalized = raw.strip()
        match = SEMVER_PATTERN.fullmatch(normalized)
        if not match:
            raise ValueError(f"Invalid semantic version: {raw!r}")

        major, minor, patch = (int(part) for part in match.groups())
        return cls(major=major, minor=minor, patch=patch)

    def bump_major(self) -> "Version":
        return Version(self.major + 1, 0, 0)

    def bump_minor(self) -> "Version":
        return Version(self.major, self.minor + 1, 0)

    def bump_patch(self) -> "Version":
        return Version(self.major, self.minor, self.patch + 1)

    def __str__(self) -> str:
        return f"{self.major}.{self.minor}.{self.patch}"
