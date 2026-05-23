from __future__ import annotations

from dataclasses import dataclass
import re
from pathlib import Path

from tools.release.changelog.git_collect import get_file_patch
from tools.release.changelog.models import CategoryContext, DiffSnippet, FileChange
from tools.release.changelog.scoring import is_semantic_noise_path, score_patch_hunk

try:
    from unidiff import PatchSet
except ModuleNotFoundError:  # pragma: no cover - exercised by environments without optional dependency.
    PatchSet = None

UNIDIFF_AVAILABLE = PatchSet is not None

HUNK_HEADER_RE = re.compile(r"^@@ .* @@.*$", re.MULTILINE)
HUNK_META_RE = re.compile(
    r"^@@\s*-(?P<source_start>\d+)(?:,(?P<source_len>\d+))?\s+\+(?P<target_start>\d+)"
    r"(?:,(?P<target_len>\d+))?\s*@@(?P<section>.*)$"
)
_FUNCTION_SIGNATURE_RE = re.compile(
    r"\b(def|class|struct|interface|enum|function|fn|it|test|describe)\b\s*([A-Za-z_][A-Za-z0-9_]*)?",
    re.IGNORECASE,
)
_COMMAND_SURFACE_RE = re.compile(r"\b(add_parser|add_argument|subparsers|argparse)\b")
_USAGE_SURFACE_RE = re.compile(r"\b(usage|help|command book|usage manager|register_command|register handler)\b")
_CONFIG_KEY_RE = re.compile(r"^[+-]\s*[\"']?[a-zA-Z_][a-zA-Z0-9_.-]*[\"']?\s*[:=]", re.MULTILINE)
_MAX_ADJACENT_HUNK_GAP = 24
_MAX_SAME_REGION_GAP = 320
_MAX_GROUPED_HUNKS = 16
_MAX_UNIT_CHANGED_LINES = 420
_MAX_UNIT_CHARS = 24000
_MAX_SINGLE_UNIT_SEGMENT_LINES = 220
_MIN_LINES_BEFORE_SPLIT_ANCHOR = 80


@dataclass(frozen=True)
class _ParsedHunk:
    text: str
    source_start: int | None
    source_length: int | None
    target_start: int | None
    target_length: int | None
    section_header: str | None = None


@dataclass(frozen=True)
class _EvidenceUnit:
    text: str
    hunk_count: int
    changed_line_count: int
    meaningful_line_count: int
    region_kind: str
    region_label: str | None = None


def split_patch_into_hunks(patch: str) -> list[str]:
    return [hunk.text for hunk in _parse_patch_hunks(patch)]


def build_snippet_reason(
    file_change: FileChange,
    hunk: str,
    category: str,
    *,
    hunk_count: int = 1,
    changed_lines: int | None = None,
    region_kind: str | None = None,
    region_label: str | None = None,
) -> str:
    del hunk  # Reason currently depends on file-level signals.

    reasons = [f"Selected from high-scoring {category} file"]
    if region_kind is not None:
        if region_label:
            reasons.append(f"{region_kind} region `{region_label}`")
        else:
            reasons.append(f"{region_kind} region")
    if hunk_count > 1:
        reasons.append(f"grouped {hunk_count} related hunks")
    if changed_lines is not None and changed_lines >= 8:
        reasons.append(f"{changed_lines} changed lines")
    if file_change.commit_count > 1:
        reasons.append(f"touched in {file_change.commit_count} commits")
    if file_change.flags:
        reasons.append(f"flags: {', '.join(file_change.flags)}")
    return "; ".join(reasons)


def extract_relevant_snippets(
    repo_root: Path | str,
    previous_tag: str | None,
    category_contexts: dict[str, CategoryContext],
    max_files_per_category: int = 5,
    max_hunks_per_file: int = 2,
) -> dict[str, list[DiffSnippet]]:
    repo_root = Path(repo_root).resolve()
    results: dict[str, list[DiffSnippet]] = {}

    for category_name, context in category_contexts.items():
        snippets: list[DiffSnippet] = []
        max_files, base_hunks_per_file, max_total_snippets = _category_snippet_budget(
            context,
            max_files_per_category=max_files_per_category,
            max_hunks_per_file=max_hunks_per_file,
        )
        candidate_files = [
            file_change
            for file_change in context.files
            if not is_semantic_noise_path(file_change.path)
        ][:max_files]

        for file_change in candidate_files:
            patch = get_file_patch(repo_root, file_change.path, previous_tag)
            if not patch.strip():
                continue

            evidence_units = _extract_evidence_units(file_change.path, patch)
            if not evidence_units:
                continue

            ranked_units = sorted(
                evidence_units,
                key=lambda unit: _score_evidence_unit(unit, category_name, file_change.path),
                reverse=True,
            )

            file_hunk_cap = _file_hunk_cap(
                file_change,
                base_hunks_per_file=base_hunks_per_file,
                remaining=max_total_snippets - len(snippets),
            )
            if file_hunk_cap <= 0:
                break

            for unit in ranked_units[:file_hunk_cap]:
                snippet_score = _score_evidence_unit(unit, category_name, file_change.path)
                reason = build_snippet_reason(
                    file_change,
                    unit.text,
                    category_name,
                    hunk_count=unit.hunk_count,
                    changed_lines=unit.changed_line_count,
                    region_kind=unit.region_kind,
                    region_label=unit.region_label,
                )
                snippets.append(
                    DiffSnippet(
                        path=file_change.path,
                        category=category_name,
                        subscopes=file_change.subscopes,
                        score=snippet_score,
                        reason=reason,
                        patch=unit.text,
                        flags=file_change.flags,
                        region_kind=unit.region_kind,
                        region_label=unit.region_label,
                        hunk_count=unit.hunk_count,
                        changed_lines=unit.changed_line_count,
                        meaningful_lines=unit.meaningful_line_count,
                    )
                )
                if len(snippets) >= max_total_snippets:
                    break
            if len(snippets) >= max_total_snippets:
                break

        snippets.sort(key=lambda item: item.score, reverse=True)
        results[category_name] = snippets

    return results


def _category_snippet_budget(
    context: CategoryContext,
    *,
    max_files_per_category: int,
    max_hunks_per_file: int,
) -> tuple[int, int, int]:
    change_total = context.insertions + context.deletions
    heaviness = 0
    heaviness += min(context.commit_count // 3, 5)
    heaviness += min(change_total // 220, 5)
    heaviness += min(len(context.files) // 8, 4)

    file_cap = min(36, max_files_per_category + (heaviness * 3))
    hunk_cap = min(10, max_hunks_per_file + min(heaviness, 5))
    total_snippet_cap = min(260, 18 + (context.commit_count * 5) + (heaviness * 12))
    return file_cap, hunk_cap, total_snippet_cap


def _file_hunk_cap(
    file_change: FileChange,
    *,
    base_hunks_per_file: int,
    remaining: int,
) -> int:
    if remaining <= 0:
        return 0
    change_total = file_change.insertions + file_change.deletions
    commit_touch_bonus = min(file_change.commit_count, 4) - 1 if file_change.commit_count > 1 else 0
    change_bonus = min(change_total // 140, 4)
    cap = base_hunks_per_file + max(commit_touch_bonus, 0) + change_bonus
    return max(1, min(cap, remaining))


def _extract_evidence_units(path: str, patch: str) -> list[_EvidenceUnit]:
    parsed_hunks = _parse_patch_hunks(patch)
    if not parsed_hunks:
        return []

    lifted_units = _lift_hunks_to_logical_units(path, parsed_hunks)
    if not lifted_units:
        return []

    split_units = _split_large_units(path, lifted_units)
    if not split_units:
        return []

    filtered = [unit for unit in split_units if _is_semantically_useful_unit(unit)]
    return filtered if filtered else split_units


def _parse_patch_hunks(patch: str) -> list[_ParsedHunk]:
    if not patch.strip():
        return []

    parsed = _parse_with_unidiff(patch)
    if parsed:
        return parsed
    return _parse_with_regex(patch)


def _parse_with_unidiff(patch: str) -> list[_ParsedHunk]:
    if PatchSet is None:
        return []
    try:
        patch_set = PatchSet(patch.splitlines(keepends=True))
    except Exception:
        return []

    parsed: list[_ParsedHunk] = []
    for patched_file in patch_set:
        if getattr(patched_file, "is_binary_file", False):
            continue
        for hunk in patched_file:
            rendered = str(hunk).strip()
            if not rendered:
                continue
            parsed.append(
                _ParsedHunk(
                    text=rendered,
                    source_start=getattr(hunk, "source_start", None),
                    source_length=getattr(hunk, "source_length", None),
                    target_start=getattr(hunk, "target_start", None),
                    target_length=getattr(hunk, "target_length", None),
                    section_header=_normalize_region_label(getattr(hunk, "section_header", "")),
                )
            )
    return parsed


def _parse_with_regex(patch: str) -> list[_ParsedHunk]:
    matches = list(HUNK_HEADER_RE.finditer(patch))
    if not matches:
        cleaned = patch.strip()
        if not cleaned:
            return []
        return [
            _ParsedHunk(
                text=cleaned,
                source_start=None,
                source_length=None,
                target_start=None,
                target_length=None,
                section_header=None,
            )
        ]

    hunks: list[_ParsedHunk] = []
    for index, match in enumerate(matches):
        start = match.start()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(patch)
        rendered = patch[start:end].strip()
        if not rendered:
            continue
        first_line = rendered.splitlines()[0] if rendered.splitlines() else ""
        meta = HUNK_META_RE.match(first_line)
        source_start = int(meta.group("source_start")) if meta and meta.group("source_start") else None
        source_length = int(meta.group("source_len")) if meta and meta.group("source_len") else None
        target_start = int(meta.group("target_start")) if meta and meta.group("target_start") else None
        target_length = int(meta.group("target_len")) if meta and meta.group("target_len") else None
        section_header = _normalize_region_label(meta.group("section")) if meta else None
        hunks.append(
            _ParsedHunk(
                text=rendered,
                source_start=source_start,
                source_length=source_length,
                target_start=target_start,
                target_length=target_length,
                section_header=section_header,
            )
        )
    return hunks


def _lift_hunks_to_logical_units(path: str, hunks: list[_ParsedHunk]) -> list[_EvidenceUnit]:
    if not hunks:
        return []

    groups: list[tuple[list[_ParsedHunk], str | None]] = []
    index = 0
    while index < len(hunks):
        current_group = [hunks[index]]
        current_label = _region_label_for_hunk(path, hunks[index])
        index += 1
        while index < len(hunks) and len(current_group) < _MAX_GROUPED_HUNKS:
            next_hunk = hunks[index]
            next_label = _region_label_for_hunk(path, next_hunk)
            if not _should_group_hunks(current_group[-1], next_hunk, current_label, next_label):
                break
            current_group.append(next_hunk)
            if current_label is None and next_label is not None:
                current_label = next_label
            index += 1
        groups.append((current_group, current_label))

    units: list[_EvidenceUnit] = []
    for group, region_label in groups:
        rendered = _join_group_hunks(group)
        if not rendered:
            continue
        changed_line_count, meaningful_line_count = _change_line_counts(rendered)
        region_kind = _infer_region_kind(path, rendered, region_label)
        units.append(
            _EvidenceUnit(
                text=rendered,
                hunk_count=len(group),
                changed_line_count=changed_line_count,
                meaningful_line_count=meaningful_line_count,
                region_kind=region_kind,
                region_label=region_label,
            )
        )
    return units


def _should_group_hunks(
    left: _ParsedHunk,
    right: _ParsedHunk,
    left_label: str | None,
    right_label: str | None,
) -> bool:
    if left_label is not None and right_label is not None and left_label == right_label:
        return True

    if left_label is None and right_label is None:
        return _hunks_are_adjacent(left, right, _MAX_ADJACENT_HUNK_GAP)

    return False


def _join_group_hunks(group: list[_ParsedHunk]) -> str:
    seen: set[str] = set()
    rendered_parts: list[str] = []
    for hunk in group:
        text = hunk.text.strip()
        if not text:
            continue
        if text in seen:
            continue
        seen.add(text)
        rendered_parts.append(text)
    return "\n\n".join(rendered_parts).strip()


def _hunks_are_adjacent(left: _ParsedHunk, right: _ParsedHunk, max_gap: int) -> bool:
    source_gap = _line_gap(left.source_start, left.source_length, right.source_start)
    target_gap = _line_gap(left.target_start, left.target_length, right.target_start)
    if source_gap is None and target_gap is None:
        return False
    return (source_gap is not None and source_gap <= max_gap) or (target_gap is not None and target_gap <= max_gap)


def _line_gap(start: int | None, length: int | None, next_start: int | None) -> int | None:
    if start is None or next_start is None:
        return None
    if length is None:
        length = 1
    end_line = start + max(length - 1, 0)
    gap = next_start - end_line
    if gap < 0:
        return 0
    return gap


def _split_large_units(path: str, units: list[_EvidenceUnit]) -> list[_EvidenceUnit]:
    split_units: list[_EvidenceUnit] = []
    for unit in units:
        if not _is_large_unit(unit):
            split_units.append(unit)
            continue

        split = _split_large_unit(path, unit)
        if split:
            split_units.extend(split)
        else:
            split_units.append(unit)
    return split_units


def _is_large_unit(unit: _EvidenceUnit) -> bool:
    if unit.changed_line_count > _MAX_UNIT_CHANGED_LINES:
        return True
    return len(unit.text) > _MAX_UNIT_CHARS


def _split_large_unit(path: str, unit: _EvidenceUnit) -> list[_EvidenceUnit]:
    hunks = _parse_patch_hunks(unit.text)
    if len(hunks) > 1:
        out: list[_EvidenceUnit] = []
        for hunk in hunks:
            sub = _build_unit_from_hunks(path, [hunk], unit.region_label)
            if _is_large_unit(sub):
                out.extend(_split_large_single_hunk(path, sub))
            else:
                out.append(sub)
        return out
    return _split_large_single_hunk(path, unit)


def _split_large_single_hunk(path: str, unit: _EvidenceUnit) -> list[_EvidenceUnit]:
    lines = unit.text.splitlines()
    if len(lines) <= 2:
        return [unit]

    header = lines[0] if lines[0].startswith("@@") else None
    body = lines[1:] if header is not None else lines
    if len(body) <= _MAX_SINGLE_UNIT_SEGMENT_LINES:
        return [unit]

    segments: list[list[str]] = []
    current: list[str] = []
    for line in body:
        payload = line[1:].strip() if line.startswith(("+", "-")) else line.strip()
        is_anchor = line.startswith(("+", "-")) and _is_region_anchor_line(payload, path)
        should_split = len(current) >= _MAX_SINGLE_UNIT_SEGMENT_LINES
        should_split = should_split or (is_anchor and len(current) >= _MIN_LINES_BEFORE_SPLIT_ANCHOR)
        if should_split and current:
            segments.append(current)
            current = []
        current.append(line)
    if current:
        segments.append(current)

    if len(segments) <= 1:
        return [unit]

    out: list[_EvidenceUnit] = []
    for segment in segments:
        if not segment:
            continue
        rendered_lines: list[str] = []
        if header is not None:
            rendered_lines.append(header)
        rendered_lines.extend(segment)
        rendered = "\n".join(rendered_lines).strip()
        if not rendered:
            continue
        label = _extract_region_label_from_text(path, rendered) or unit.region_label
        changed, meaningful = _change_line_counts(rendered)
        out.append(
            _EvidenceUnit(
                text=rendered,
                hunk_count=1,
                changed_line_count=changed,
                meaningful_line_count=meaningful,
                region_kind=_infer_region_kind(path, rendered, label),
                region_label=label,
            )
        )
    return out if out else [unit]


def _build_unit_from_hunks(path: str, hunks: list[_ParsedHunk], fallback_label: str | None) -> _EvidenceUnit:
    rendered = "\n\n".join(hunk.text for hunk in hunks).strip()
    label = fallback_label
    if label is None and hunks:
        label = _region_label_for_hunk(path, hunks[0])
    changed, meaningful = _change_line_counts(rendered)
    return _EvidenceUnit(
        text=rendered,
        hunk_count=max(len(hunks), 1),
        changed_line_count=changed,
        meaningful_line_count=meaningful,
        region_kind=_infer_region_kind(path, rendered, label),
        region_label=label,
    )


def _change_line_counts(rendered_hunk: str) -> tuple[int, int]:
    changed = 0
    meaningful = 0
    for line in rendered_hunk.splitlines():
        if line.startswith("+++ ") or line.startswith("--- ") or line.startswith("@@"):
            continue
        if not line.startswith(("+", "-")):
            continue
        changed += 1
        if not _is_noise_change_line(line):
            meaningful += 1
    return changed, meaningful


def _is_semantically_useful_unit(unit: _EvidenceUnit) -> bool:
    if unit.meaningful_line_count >= 1:
        return True
    return unit.changed_line_count >= 10


def _score_evidence_unit(unit: _EvidenceUnit, category: str, path: str) -> float:
    score = score_patch_hunk(unit.text, category, path)
    if unit.hunk_count > 1:
        score += min(unit.hunk_count - 1, 2) * 1.4
    if unit.region_label is not None:
        score += 1.0
    if unit.meaningful_line_count >= 8:
        score += 1.2
    if unit.meaningful_line_count == 0:
        score -= 6.0
    return round(score, 2)


def _is_noise_change_line(line: str) -> bool:
    payload = line[1:].strip() if line.startswith(("+", "-")) else line.strip()
    if not payload:
        return True

    lower = payload.lower()
    if lower.startswith(("import ", "from ", "#include ", "using ", "use ")):
        return True
    if payload.startswith(("//", "/*", "*", "#")):
        return True
    if re.fullmatch(r"[{}\[\](),.;:]+", payload):
        return True
    return False


def _region_label_for_hunk(path: str, hunk: _ParsedHunk) -> str | None:
    if hunk.section_header:
        return _normalize_region_label(hunk.section_header)
    return _extract_region_label_from_text(path, hunk.text)


def _extract_region_label_from_text(path: str, text: str) -> str | None:
    for raw_line in text.splitlines():
        if raw_line.startswith(("+++", "---", "@@")):
            continue
        line = raw_line[1:].strip() if raw_line.startswith(("+", "-")) else raw_line.strip()
        if not line:
            continue
        match = _FUNCTION_SIGNATURE_RE.search(line)
        if match is not None:
            identifier = match.group(2)
            keyword = match.group(1).lower()
            if identifier:
                return _normalize_region_label(f"{keyword} {identifier}")
            return _normalize_region_label(keyword)
        if _COMMAND_SURFACE_RE.search(line):
            return "command registration"
        if _is_config_key_line(raw_line):
            key_match = re.match(r"^[+-]\s*[\"']?([a-zA-Z_][a-zA-Z0-9_.-]*)[\"']?\s*[:=]", raw_line)
            if key_match is not None:
                return _normalize_region_label(f"config {key_match.group(1)}")
            return "config block"
    lower_path = path.lower()
    if "/tests/" in f"/{lower_path}" or lower_path.startswith("test_"):
        return "test block"
    return None


def _normalize_region_label(label: str | None) -> str | None:
    if label is None:
        return None
    cleaned = re.sub(r"\s+", " ", label).strip(" -:\t{}")
    if not cleaned:
        return None
    if len(cleaned) > 120:
        cleaned = cleaned[:120].rstrip()
    return cleaned


def _infer_region_kind(path: str, text: str, region_label: str | None) -> str:
    merged = f"{path}\n{region_label or ''}\n{text}".lower()
    lower_path = path.lower()
    is_test_path = "/tests/" in f"/{lower_path}" or lower_path.startswith("test_")
    deletion_heavy = _is_deletion_heavy_text(text)

    if _has_usage_signals(merged):
        return "usage"
    if _COMMAND_SURFACE_RE.search(merged) is not None or "--" in merged:
        return "command"
    if _is_declaration_region(path, text):
        return "declaration"
    if is_test_path and not deletion_heavy:
        return "test"
    if (merged.find("test ") >= 0 or "assert" in merged) and not deletion_heavy:
        return "test"
    if _has_config_key_changes(text) or path.lower().endswith((".yml", ".yaml", ".toml", ".ini", ".json")):
        return "config"
    if "class " in merged:
        return "class"
    if "struct " in merged:
        return "struct"
    if "def " in merged or "function " in merged or "fn " in merged:
        return "function"
    return "block"


def _is_region_anchor_line(line: str, path: str) -> bool:
    lower = line.lower()
    if _FUNCTION_SIGNATURE_RE.search(line) is not None:
        return True
    if _COMMAND_SURFACE_RE.search(lower) is not None:
        return True
    if _USAGE_SURFACE_RE.search(lower) is not None:
        return True
    if _CONFIG_KEY_RE.match(f"+{line}") is not None:
        return True
    if "/tests/" in f"/{path.lower()}" and lower.startswith(("def test_", "it(", "test(", "describe(")):
        return True
    return False


def _has_config_key_changes(text: str) -> bool:
    for line in text.splitlines():
        if _is_config_key_line(line):
            return True
    return False


def _is_config_key_line(line: str) -> bool:
    if not _CONFIG_KEY_RE.match(line):
        return False
    payload = line[1:].strip() if line.startswith(("+", "-")) else line.strip()
    if "(" in payload or ")" in payload:
        return False
    lower = payload.lower()
    control_prefixes = (
        "if ",
        "elif ",
        "for ",
        "while ",
        "def ",
        "class ",
        "return ",
        "raise ",
        "try:",
        "except",
    )
    return not lower.startswith(control_prefixes)


def _has_usage_signals(merged: str) -> bool:
    if _USAGE_SURFACE_RE.search(merged) is not None:
        return True
    return any(token in merged for token in ("--help", "usage:", "help_text", "usage_text"))


def _is_declaration_region(path: str, text: str) -> bool:
    lower_path = path.lower()
    declaration_suffixes = (".h", ".hpp", ".hh", ".hxx", ".d.ts")
    declaration_lines = 0
    meaningful_lines = 0
    for line in text.splitlines():
        if line.startswith(("+++", "---", "@@")):
            continue
        if not line.startswith(("+", "-")):
            continue
        payload = line[1:].strip()
        if not payload:
            continue
        meaningful_lines += 1
        lower = payload.lower()
        if (
            lower.startswith(("class ", "struct ", "enum ", "typedef ", "using ", "template<", "namespace "))
            or lower.endswith(";")
            or "(" in lower and ")" in lower and lower.endswith(";")
        ):
            declaration_lines += 1

    if meaningful_lines == 0:
        return False
    if lower_path.endswith(declaration_suffixes):
        return declaration_lines >= max(1, meaningful_lines // 3)
    return declaration_lines >= max(2, (meaningful_lines * 2) // 3)


def _is_deletion_heavy_text(text: str) -> bool:
    added = 0
    removed = 0
    for line in text.splitlines():
        if line.startswith("+++ ") or line.startswith("--- ") or line.startswith("@@"):
            continue
        if line.startswith("+"):
            added += 1
        elif line.startswith("-"):
            removed += 1
    if removed == 0:
        return False
    return removed >= max(added * 2, added + 4)
