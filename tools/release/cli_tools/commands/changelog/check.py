import argparse

from tools.release.changelog.ai import run_provider_preflight
from tools.release.cli_tools.commands.changelog.build import build_ai_provider_config_from_args, \
    build_ai_provider_from_config
from tools.release.cli_tools.changelog.print import print_provider_preflight_result


def cmd_changelog_ai_check(args: argparse.Namespace) -> int:
    provider_config = build_ai_provider_config_from_args(args)
    provider = build_ai_provider_from_config(provider_config)
    result = run_provider_preflight(provider_config, provider=provider, require_model=True)
    print_provider_preflight_result(result)
    return 0
