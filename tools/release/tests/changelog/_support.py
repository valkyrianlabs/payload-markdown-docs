from __future__ import annotations

import json
from pathlib import Path
import unittest


def load_json_fixture(test_file: str, name: str) -> dict:
    fixtures_dir = Path(test_file).parent / "fixtures"
    return json.loads((fixtures_dir / name).read_text(encoding="utf-8"))


def load_text_fixture(test_file: str, name: str) -> str:
    fixtures_dir = Path(test_file).parent / "fixtures"
    return (fixtures_dir / name).read_text(encoding="utf-8")


class RecordingStructuredProvider:
    def __init__(self, response: dict) -> None:
        self._response = response
        self.calls: list[dict] = []

    def generate_structured_json(self, **kwargs):
        self.calls.append(kwargs)
        return self._response


def assert_contains_all(case: unittest.TestCase, text: str, fragments: tuple[str, ...]) -> None:
    for fragment in fragments:
        case.assertIn(fragment, text)


def assert_not_contains_any(case: unittest.TestCase, text: str, fragments: tuple[str, ...]) -> None:
    for fragment in fragments:
        case.assertNotIn(fragment, text)
