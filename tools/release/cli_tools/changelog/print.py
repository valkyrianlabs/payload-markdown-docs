from tools.release.changelog.ai import ProviderPreflightResult
from tools.release.cli_tools.print import print_status


def print_provider_preflight_result(result: ProviderPreflightResult) -> None:
    print("AI provider check")
    print("-----------------")
    print(f"Provider:         {result.provider_kind}")
    print(f"Model:            {result.model}")
    if result.base_url:
        print(f"Base URL:         {result.base_url}")
    print(f"Reachability:     OK")
    print(f"Discovered models:{len(result.discovered_models):>2}")
    if result.discovered_models:
        print(f"Model match:      {'yes' if result.model_found else 'no'}")
        print("Sample models:")
        for model in result.discovered_models[:10]:
            print(f"  - {model}")



def log_release_ai_preflight(settings) -> None:
    print_status("Release AI preflight")
    print_status("--------------------")
    print_status(f"RELEASE_AI_MODE:               {settings.mode}")
    print_status(f"Release AI profile:            {settings.openai_profile}")
    print_status("  (from VL_AI_RELEASE_PROFILE, RELEASE_AI_PROFILE or RELEASE_AI_PROFILE_OPENAI)")
    print_status(f"OPENAI_API_KEY configured:     {'yes' if settings.openai_api_key_present else 'no'}")
    print_status(
        "DeepSeek key configured:       "
        f"{'yes' if getattr(settings, 'deepseek_api_key_present', False) else 'no'}"
        " (VL_DEEPSEEK_API_KEY or DEEPSEEK_API_KEY)"
    )
    print_status(f"RELEASE_LOCAL_LLM_ENABLED:     {'true' if settings.local_enabled else 'false'}")
    print_status(
        f"RELEASE_LOCAL_LLM_PROFILE:     "
        f"{settings.local_profile if settings.local_profile else '<unset>'}"
    )
    print_status(
        f"RELEASE_LOCAL_LLM_BASE_URL:    "
        f"{settings.local_base_url_override if settings.local_base_url_override else '<unset>'}"
    )
    if settings.mode == "openai-only" and not (
        settings.openai_api_key_present or getattr(settings, "deepseek_api_key_present", False)
    ):
        print_status(
            "Preflight note: openai-only (hosted AI) requested but no hosted provider key is set; "
            "manual fallback may be used."
        )
    if settings.mode == "local-only" and (not settings.local_enabled or not settings.local_profile):
        print_status(
            "Preflight note: local-only requested but local fallback is not fully configured; "
            "manual fallback may be used."
        )
