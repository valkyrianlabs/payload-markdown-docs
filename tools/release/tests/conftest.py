from __future__ import annotations

import pytest
from unittest.mock import patch


def pytest_configure(config) -> None:
    config.addinivalue_line(
        "markers",
        "allow_real_ai_provider: opt out of the default test guard that blocks real AI SDK client construction",
    )


@pytest.fixture(autouse=True)
def guard_real_ai_provider_calls(request):
    if request.node.get_closest_marker("allow_real_ai_provider"):
        yield
        return

    with patch(
        "tools.release.changelog.ai.providers.openai._build_sdk_client",
        side_effect=AssertionError(
            "Real AI provider/client construction escaped test mocks via "
            "tools.release.changelog.ai.providers.openai._build_sdk_client"
        ),
    ):
        yield
