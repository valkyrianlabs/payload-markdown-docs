from dataclasses import dataclass, field

@dataclass(frozen=True)
class CommitInfo:
    sha: str
    subject: str
    body: str
    files: list[str]
    insertions: int
    deletions: int
    categories: list[str]

@dataclass(frozen=True)
class FileChange:
    path: str
    category: str
    subscopes: tuple[str, ...]
    insertions: int
    deletions: int
    commit_count: int
    score: float
    flags: tuple[str, ...] = ()

@dataclass(frozen=True)
class DiffSnippet:
    path: str
    category: str
    subscopes: tuple[str, ...]
    score: float
    reason: str
    patch: str
    flags: tuple[str, ...] = ()
    region_kind: str | None = None
    region_label: str | None = None
    hunk_count: int = 1
    changed_lines: int = 0
    meaningful_lines: int = 0

@dataclass(frozen=True)
class CategoryContext:
    name: str
    commit_count: int
    insertions: int
    deletions: int
    commits: list[CommitInfo] = field(default_factory=list)
    files: list[FileChange] = field(default_factory=list)
    snippets: list[DiffSnippet] = field(default_factory=list)
    detected_themes: list[str] = field(default_factory=list)

@dataclass(frozen=True)
class ReleaseContext:
    version: str
    previous_tag: str | None
    head_sha: str
    commit_count: int
    categories: dict[str, CategoryContext]
    commits: list[CommitInfo] = field(default_factory=list)
    uncategorized_commits: list[CommitInfo] = field(default_factory=list)
    cross_cutting_notes: list[str] = field(default_factory=list)
    latest_tag: str | None = None
    skipped_current_release_tag: bool = False
    explicit_previous_tag: bool = False
    release_kind: str = "standard"
    release_focus: tuple[str, ...] = ()


@dataclass(frozen=True)
class SemanticHunk:
    path: str
    kind: str
    why_selected: str
    excerpt: str
    region_type: str | None = None
    context_label: str | None = None


@dataclass(frozen=True)
class SemanticCommitCandidate:
    sha: str
    subject: str
    body: str | None
    categories: tuple[str, ...]
    changed_files: int
    insertions: int
    deletions: int
    weight_score: int
    weight: str
    sample_paths: tuple[str, ...] = ()


@dataclass(frozen=True)
class CategorySemanticPacket:
    name: str
    signal_strength: str
    summary_hint: str
    key_commits: tuple[str, ...]
    candidate_commits: tuple[SemanticCommitCandidate, ...]
    supporting_files: tuple[str, ...]
    semantic_hunks: tuple[SemanticHunk, ...]
    caution_notes: tuple[str, ...] = ()


@dataclass(frozen=True)
class SemanticReleasePayload:
    schema_version: str
    version: str
    previous_tag: str | None
    head_sha: str
    commit_count: int
    categories: tuple[CategorySemanticPacket, ...]
    all_commits: tuple[SemanticCommitCandidate, ...] = ()
    notes: tuple[str, ...] = ()
    release_kind: str = "standard"
    release_focus: tuple[str, ...] = ()
