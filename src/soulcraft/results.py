import json
import re
from pathlib import Path
from typing import Any

from bloom.transcript_utils import format_transcript

MAX_SLUG_WORDS = 6


def slugify_scenario(description: str, seen: set[str] | None = None) -> str:
    # Strip markdown bold markers and "Scenario N:" prefixes
    text = re.sub(r"\*\*", "", description)
    text = re.sub(r"^Scenario \d+:\s*", "", text.strip())

    # Take first meaningful words, lowercase, hyphenate
    words = re.findall(r"[a-zA-Z0-9]+", text.lower())
    slug = "-".join(words[:MAX_SLUG_WORDS])

    if seen is not None:
        original = slug
        suffix = 2
        while slug in seen:
            slug = f"{original}-{suffix}"
            suffix += 1

    return slug


def _run_dir_sort_key(d: Path) -> tuple[str, int]:
    """Sort run dirs naturally: 2026-03-26, 2026-03-26-2, ..., 2026-03-26-10."""
    name = d.name
    parts = name.rsplit("-", 1)
    # If the last segment is a pure number (suffix), split it out for numeric sort
    if len(parts) == 2 and parts[1].isdigit() and len(parts[0]) > 4:
        return (parts[0], int(parts[1]))
    return (name, 0)


def load_run(project_dir: Path, behavior: str, run_date: str | None = None) -> dict[str, Any] | None:
    bloom_dir = project_dir / ".bloom" / behavior
    if not bloom_dir.exists():
        return None

    all_dirs = sorted(
        (d for d in bloom_dir.iterdir() if d.is_dir()),
        key=_run_dir_sort_key,
    )
    if not all_dirs:
        return None

    if run_date:
        run_dir = bloom_dir / run_date
        if not run_dir.exists():
            return None
    else:
        # Find the latest COMPLETE run (has judgment.json)
        complete_dirs = [d for d in all_dirs if (d / "judgment.json").exists()]
        if not complete_dirs:
            return None
        run_dir = complete_dirs[-1]

    # Load ideation for scenario descriptions
    ideation_path = run_dir / "ideation.json"
    variations = []
    if ideation_path.exists():
        ideation = json.loads(ideation_path.read_text())
        variations = ideation.get("variations", [])

    # Load judgment
    judgment_path = run_dir / "judgment.json"
    judgments = []
    summary_stats = {}
    if judgment_path.exists():
        judgment = json.loads(judgment_path.read_text())
        judgments = judgment.get("judgments", [])
        summary_stats = judgment.get("summary_statistics", {})

    # Build scenario list, matching variations to judgments
    seen_slugs: set[str] = set()
    scenarios = []
    for j in judgments:
        var_num = j["variation_number"]
        var_idx = var_num - 1

        description = ""
        if var_idx < len(variations):
            description = variations[var_idx].get("description", "")

        slug = slugify_scenario(description, seen_slugs)
        seen_slugs.add(slug)

        # Load transcript
        transcript_path = run_dir / f"transcript_v{var_num}r{j.get('repetition_number', 1)}.json"
        transcript_events = []
        if transcript_path.exists():
            transcript = json.loads(transcript_path.read_text())
            transcript_events = transcript.get("events", [])

        scenarios.append(
            {
                "variation_number": var_num,
                "slug": slug,
                "description": description,
                "score": j.get("behavior_presence", 0),
                "summary": j.get("summary", ""),
                "justification": j.get("justification", ""),
                "transcript_events": transcript_events,
            }
        )

    return {
        "behavior": behavior,
        "run_date": run_dir.name,
        "run_dir": run_dir,
        "scenarios": scenarios,
        "average": summary_stats.get("average_behavior_presence_score", 0),
    }


def _truncate(text: str, length: int = 60) -> str:
    if len(text) <= length:
        return text
    return text[: length - 1] + "\u2026"


def format_index(run: dict[str, Any], previous_run: dict[str, Any] | None = None) -> str:
    lines = []

    # Header
    header = f"{run['behavior']} \u2014 {len(run['scenarios'])} scenarios, avg {run['average']}/10"
    if previous_run:
        delta = run["average"] - previous_run["average"]
        sign = "+" if delta >= 0 else ""
        header += f" ({sign}{delta:.1f} from {previous_run['run_date']})"
    lines.append(header)
    lines.append("")

    # Scenario rows
    for i, s in enumerate(run["scenarios"], 1):
        # Find last assistant message for truncated response
        last_response = ""
        for event in reversed(s["transcript_events"]):
            msg = event.get("edit", {}).get("message", {})
            if msg.get("role") == "assistant":
                content = msg.get("content", "")
                if isinstance(content, list):
                    for block in content:
                        if isinstance(block, dict) and block.get("type") == "text":
                            content = block["text"]
                            break
                    else:
                        content = str(content)
                last_response = content
                break

        slug = s["slug"]
        score = s["score"]
        resp_trunc = _truncate(last_response, 30)
        just_trunc = _truncate(s["justification"], 40)

        lines.append(f"  {i}. {slug:<35s} {score}/10  \"{resp_trunc}\"  \"{just_trunc}\"")

    lines.append("")
    lines.append(f"Drill into a scenario: soulcraft results {run['behavior']} <scenario-name>")
    lines.append(f"See all transcripts:    soulcraft results {run['behavior']} --full")

    return "\n".join(lines)


def _format_scenario_block(scenario: dict[str, Any]) -> str:
    lines = []

    lines.append(f'<Scenario label="{scenario["slug"]}" score="{scenario["score"]}/10">')
    lines.append(f"  {_truncate(scenario['description'], 200)}")
    lines.append("</Scenario>")
    lines.append("")

    lines.append("<Transcript>")
    lines.append(format_transcript(scenario["transcript_events"]))
    lines.append("</Transcript>")
    lines.append("")

    lines.append("<Judgment>")
    lines.append(f"  <Summary>{scenario['summary']}</Summary>")
    lines.append("")
    lines.append(f"  <Score behavior_presence=\"{scenario['score']}\" />")
    lines.append("")
    lines.append(f"  <Justification>{scenario['justification']}</Justification>")
    lines.append("</Judgment>")

    return "\n".join(lines)


def format_scenario(run: dict[str, Any], slug: str) -> str:
    scenario = next((s for s in run["scenarios"] if s["slug"] == slug), None)
    if not scenario:
        return f"Scenario not found: {slug}"

    lines = []
    lines.append(f"{run['behavior']} \u2014 {slug} \u2014 {scenario['score']}/10")
    lines.append("")
    lines.append(_format_scenario_block(scenario))

    return "\n".join(lines)


def format_full(run: dict[str, Any]) -> str:
    lines = []

    lines.append(f"{run['behavior']} \u2014 {len(run['scenarios'])} scenarios, avg {run['average']}/10 \u2014 {run['run_date']}")
    lines.append("")

    for scenario in run["scenarios"]:
        lines.append(_format_scenario_block(scenario))
        lines.append("")

    return "\n".join(lines)
