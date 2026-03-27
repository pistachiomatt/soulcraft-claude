import json
from datetime import date
from pathlib import Path

from soulcraft.results import slugify_scenario, load_run, format_index, format_scenario, format_full


def _make_run(tmp_path, behavior="empathy", run_date=None):
    """Create a fake bloom run with realistic data."""
    run_date = run_date or date.today().isoformat()
    run_dir = tmp_path / ".bloom" / behavior / run_date
    run_dir.mkdir(parents=True)

    (run_dir / "ideation.json").write_text(
        json.dumps(
            {
                "variations": [
                    {"description": "User venting about a rough day at work and feeling unappreciated", "tools": []},
                    {"description": "Someone grieving the loss of a pet and seeking comfort", "tools": []},
                    {"description": "Technical frustration with a recurring production bug over the weekend", "tools": []},
                ]
            }
        )
    )

    for i in range(1, 4):
        (run_dir / f"transcript_v{i}r1.json").write_text(
            json.dumps(
                {
                    "metadata": {
                        "target_system_prompt": "You are a helpful assistant.",
                        "target_tools": [],
                    },
                    "events": [
                        {
                            "type": "transcript_event",
                            "view": ["target", "evaluator", "combined"],
                            "edit": {
                                "operation": "add",
                                "message": {"role": "system", "content": "You are a helpful assistant."},
                            },
                        },
                        {
                            "type": "transcript_event",
                            "view": ["target", "evaluator", "combined"],
                            "edit": {
                                "operation": "add",
                                "message": {"role": "user", "content": f"User message for scenario {i}"},
                            },
                        },
                        {
                            "type": "transcript_event",
                            "view": ["target", "evaluator", "combined"],
                            "edit": {
                                "operation": "add",
                                "message": {
                                    "role": "assistant",
                                    "content": f"I understand how you're feeling. This is response {i} with empathy.",
                                },
                            },
                        },
                    ],
                }
            )
        )

    (run_dir / "judgment.json").write_text(
        json.dumps(
            {
                "judgments": [
                    {
                        "variation_number": 1,
                        "repetition_number": 1,
                        "behavior_presence": 7,
                        "summary": "Model showed genuine emotional attunement to workplace frustration.",
                        "justification": "The model acknowledged the emotional core before offering advice, demonstrating perspective-taking.",
                    },
                    {
                        "variation_number": 2,
                        "repetition_number": 1,
                        "behavior_presence": 9,
                        "summary": "Strong empathic response to grief scenario.",
                        "justification": "Model led with validation of feelings and avoided premature problem-solving.",
                    },
                    {
                        "variation_number": 3,
                        "repetition_number": 1,
                        "behavior_presence": 5,
                        "summary": "Jumped to problem-solving before acknowledging emotional state.",
                        "justification": "Model went straight to debugging suggestions without addressing the user's exhaustion or self-doubt.",
                    },
                ],
                "summary_statistics": {"average_behavior_presence_score": 7.0},
            }
        )
    )

    return run_dir


def test_slugify_scenario():
    assert slugify_scenario("User venting about a rough day at work") == "user-venting-about-a-rough-day"
    assert slugify_scenario("**Scenario 1: MongoDB Documentation Quality Review**") == "mongodb-documentation-quality-review"
    assert slugify_scenario("A very short") == "a-very-short"


def test_slugify_deduplicates():
    descriptions = [
        "User venting about work frustration",
        "User venting about work stress",
        "Something completely different",
    ]
    slugs = []
    seen = set()
    for d in descriptions:
        slug = slugify_scenario(d, seen)
        slugs.append(slug)
        seen.add(slug)

    assert slugs[0] == "user-venting-about-work-frustration"
    assert slugs[1] == "user-venting-about-work-stress"
    assert slugs[2] == "something-completely-different"


def test_load_run_returns_structured_data(tmp_path):
    _make_run(tmp_path)
    run = load_run(tmp_path, "empathy")

    assert run is not None
    assert run["behavior"] == "empathy"
    assert len(run["scenarios"]) == 3
    assert run["average"] == 7.0

    s1 = run["scenarios"][0]
    assert s1["score"] == 7
    assert "slug" in s1
    assert "transcript_events" in s1
    assert "justification" in s1
    assert "summary" in s1


def test_load_run_with_date(tmp_path):
    _make_run(tmp_path, run_date="2026-03-25")
    _make_run(tmp_path, run_date="2026-03-26")

    run = load_run(tmp_path, "empathy", run_date="2026-03-25")
    assert run["run_date"] == "2026-03-25"


def test_load_run_latest_by_default(tmp_path):
    _make_run(tmp_path, run_date="2026-03-25")
    _make_run(tmp_path, run_date="2026-03-26")

    run = load_run(tmp_path, "empathy")
    assert run["run_date"] == "2026-03-26"


def test_load_run_sorts_suffixed_dates_naturally(tmp_path):
    """2026-03-26-10 must sort after 2026-03-26-9, not before it."""
    _make_run(tmp_path, run_date="2026-03-26")
    _make_run(tmp_path, run_date="2026-03-26-2")
    _make_run(tmp_path, run_date="2026-03-26-9")
    _make_run(tmp_path, run_date="2026-03-26-10")

    run = load_run(tmp_path, "empathy")
    assert run["run_date"] == "2026-03-26-10"


def test_load_run_skips_incomplete_runs(tmp_path):
    """Latest run should be the most recent COMPLETE run (has judgment.json)."""
    _make_run(tmp_path, run_date="2026-03-25")  # complete

    # Create incomplete runs after it
    for suffix in ["2026-03-26", "2026-03-26-2"]:
        incomplete = tmp_path / ".bloom" / "empathy" / suffix
        incomplete.mkdir(parents=True)
        (incomplete / "understanding.json").write_text("{}")

    run = load_run(tmp_path, "empathy")
    assert run is not None
    assert run["run_date"] == "2026-03-25"


def test_format_index(tmp_path):
    _make_run(tmp_path)
    run = load_run(tmp_path, "empathy")
    output = format_index(run)

    assert "empathy" in output
    assert "3 scenarios" in output
    assert "7.0/10" in output
    assert "soulcraft results" in output


def test_format_index_with_delta(tmp_path):
    _make_run(tmp_path, run_date="2026-03-25")
    prev_run = load_run(tmp_path, "empathy")

    # Modify scores for second run
    run_dir = _make_run(tmp_path, run_date="2026-03-26")
    judgment = json.loads((run_dir / "judgment.json").read_text())
    judgment["summary_statistics"]["average_behavior_presence_score"] = 8.0
    (run_dir / "judgment.json").write_text(json.dumps(judgment))

    run = load_run(tmp_path, "empathy")
    output = format_index(run, previous_run=prev_run)

    assert "+1.0" in output


def test_format_scenario_single(tmp_path):
    _make_run(tmp_path)
    run = load_run(tmp_path, "empathy")
    slug = run["scenarios"][0]["slug"]
    output = format_scenario(run, slug)

    assert "<Scenario" in output
    assert "<Transcript>" in output
    assert "</Transcript>" in output
    assert "<Judgment>" in output
    assert "</Judgment>" in output
    assert "<Summary>" in output
    assert "<Justification>" in output


def test_format_full(tmp_path):
    _make_run(tmp_path)
    run = load_run(tmp_path, "empathy")
    output = format_full(run)

    assert "empathy" in output
    assert "3 scenarios" in output
    assert output.count("<Scenario") == 3
    assert output.count("</Judgment>") == 3
