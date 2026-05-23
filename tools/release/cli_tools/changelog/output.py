import sys
from pathlib import Path


def write_output(content: str, output_path: str | None) -> None:
    if output_path is None or output_path == "-":
        line = content if content.endswith("\n") else f"{content}\n"
        sys.stdout.write(line)
        sys.stdout.flush()
        return

    target = Path(output_path)
    try:
        parent = target.parent
        if parent != Path(""):
            parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
    except Exception as exc:
        raise ValueError(f"Failed to write output to {target}: {exc}") from exc
