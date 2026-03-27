import json
import os
from pathlib import Path
from unittest.mock import patch

import yaml
from click.testing import CliRunner

from soulcraft.cli import main


def test_init_scaffolds_all_files(tmp_path):
    """soulcraft init creates soulcraft.yaml, prompt.md, and behaviors/ dir."""
    os.chdir(tmp_path)
    runner = CliRunner()
    result = runner.invoke(main, ["init"], catch_exceptions=False)

    assert result.exit_code == 0, result.output
    assert (tmp_path / "soulcraft.yaml").exists()
    assert (tmp_path / "prompt.md").exists()
    assert (tmp_path / "behaviors").is_dir()


def test_init_does_not_overwrite_existing(tmp_path):
    """soulcraft init won't clobber existing files."""
    os.chdir(tmp_path)
    (tmp_path / "soulcraft.yaml").write_text("custom: true")

    runner = CliRunner()
    result = runner.invoke(main, ["init"], catch_exceptions=False)

    assert (tmp_path / "soulcraft.yaml").read_text() == "custom: true"


def test_add_creates_behavior_yaml(tmp_path):
    """soulcraft add creates a behavior YAML in behaviors/."""
    os.chdir(tmp_path)
    (tmp_path / "behaviors").mkdir()

    runner = CliRunner()
    result = runner.invoke(main, ["add", "empathy"], catch_exceptions=False)

    assert result.exit_code == 0, result.output
    behavior_file = tmp_path / "behaviors" / "empathy.yaml"
    assert behavior_file.exists()

    import yaml

    content = yaml.safe_load(behavior_file.read_text())
    assert content["name"] == "empathy"
    assert "description" in content


def test_add_refuses_duplicate(tmp_path):
    """soulcraft add won't overwrite an existing behavior."""
    os.chdir(tmp_path)
    behaviors_dir = tmp_path / "behaviors"
    behaviors_dir.mkdir()
    (behaviors_dir / "empathy.yaml").write_text("name: empathy\n")

    runner = CliRunner()
    result = runner.invoke(main, ["add", "empathy"], catch_exceptions=False)

    assert result.exit_code != 0 or "already exists" in result.output


def test_project_dir_flag_overrides_cwd(tmp_path):
    """--project-dir lets commands run from a different directory."""
    project_dir = tmp_path / "my-project"
    project_dir.mkdir()
    (project_dir / "behaviors").mkdir()
    (project_dir / "behaviors" / "warmth.yaml").write_text(
        yaml.dump({"name": "warmth", "description": "Be warm."})
    )

    # Don't chdir — run from wherever, pointing at the project
    runner = CliRunner()
    result = runner.invoke(main, ["--project-dir", str(project_dir), "add", "empathy"], catch_exceptions=False)

    assert result.exit_code == 0, result.output
    assert (project_dir / "behaviors" / "empathy.yaml").exists()


def test_project_dir_flag_works_with_results(tmp_path):
    """--project-dir works with results command too."""
    project_dir = tmp_path / "my-project"
    project_dir.mkdir()
    (project_dir / "soulcraft.yaml").write_text(
        yaml.dump({
            "target_model": "claude-sonnet-4-6",
            "judge_model": "claude-sonnet-4-6",
            "evaluator_model": "claude-opus-4-6",
            "ideation_model": "claude-sonnet-4-6",
            "prompt": "prompt.md",
        })
    )
    (project_dir / "prompt.md").write_text("You are helpful.")
    _make_results(project_dir)

    runner = CliRunner()
    result = runner.invoke(
        main, ["--project-dir", str(project_dir), "results", "empathy"], catch_exceptions=False
    )

    assert result.exit_code == 0, result.output
    assert "7.0/10" in result.output


def test_compose_claude_md_substitutes_vars(tmp_path):
    """_compose_claude_md substitutes all template variables."""
    from soulcraft.cli import _compose_claude_md

    # Create a fake soulcraft root with template files
    soulcraft_root = tmp_path / "soulcraft"
    claude_dir = soulcraft_root / "soulcraft-claude"
    skill_dir = claude_dir / ".claude" / "skills" / "soulcraft"
    skill_dir.mkdir(parents=True)

    (claude_dir / "CLAUDE.md").write_text(
        "Command: {{soulcraft_command}}\nDir: {{operating_dir}}\n\n{{skill_content}}"
    )
    (skill_dir / "SKILL.md").write_text(
        "---\nname: soulcraft\ndescription: test\n---\n\nI am the skill content."
    )

    operating_dir = Path("/Users/someone/my-project")
    result = _compose_claude_md(soulcraft_root, operating_dir)

    assert "--project-dir /Users/someone/my-project" in result
    assert "/Users/someone/my-project" in result
    assert "I am the skill content." in result
    # Frontmatter should be stripped
    assert "---" not in result
    assert "name: soulcraft" not in result


def test_compose_claude_md_subs_vars_in_skill_content(tmp_path):
    """Template vars inside SKILL.md also get substituted."""
    from soulcraft.cli import _compose_claude_md

    soulcraft_root = tmp_path / "soulcraft"
    claude_dir = soulcraft_root / "soulcraft-claude"
    skill_dir = claude_dir / ".claude" / "skills" / "soulcraft"
    skill_dir.mkdir(parents=True)

    (claude_dir / "CLAUDE.md").write_text("{{skill_content}}")
    (skill_dir / "SKILL.md").write_text(
        "---\nname: test\n---\n\nRun `{{soulcraft_command}} test` in `{{operating_dir}}`"
    )

    result = _compose_claude_md(soulcraft_root, Path("/consumer/project"))

    assert "--project-dir /consumer/project test" in result
    assert "/consumer/project" in result
    assert "{{" not in result


def test_claude_cmd_uses_absolute_project_dir(tmp_path):
    """soulcraft claude resolves --project-dir to absolute before composing, so chdir can't break it."""
    from unittest.mock import patch as mock_patch
    from soulcraft.cli import _compose_claude_md, _get_project_dir

    # Simulate: user runs from /some/other/dir with --project-dir pointing to their project
    project_dir = tmp_path / "consumer-project"
    project_dir.mkdir()

    soulcraft_root = tmp_path / "soulcraft"
    claude_dir = soulcraft_root / "soulcraft-claude"
    skill_dir = claude_dir / ".claude" / "skills" / "soulcraft"
    skill_dir.mkdir(parents=True)
    (claude_dir / "CLAUDE.md").write_text("cmd: {{soulcraft_command}}\ndir: {{operating_dir}}")
    (skill_dir / "SKILL.md").write_text("---\nname: x\n---\n\nskill")

    result = _compose_claude_md(soulcraft_root, project_dir.resolve())

    # The composed output must contain the ABSOLUTE path, not relative
    assert str(project_dir.resolve()) in result
    # And the soulcraft command must use the absolute path
    assert f"--project-dir {project_dir.resolve()}" in result

    # Now simulate chdir to a completely different directory
    other_dir = tmp_path / "somewhere-else"
    other_dir.mkdir()
    original_cwd = os.getcwd()
    try:
        os.chdir(other_dir)
        # The composed paths should still work because they're absolute
        assert project_dir.resolve().exists()
        assert "somewhere-else" not in result
    finally:
        os.chdir(original_cwd)


def test_strip_frontmatter():
    """_strip_frontmatter removes YAML frontmatter."""
    from soulcraft.cli import _strip_frontmatter

    text = "---\nname: test\n---\n\nActual content."
    assert _strip_frontmatter(text) == "Actual content."

    # No frontmatter passes through
    assert _strip_frontmatter("Just content.") == "Just content."


def _scaffold_project(tmp_path):
    """Helper to create a minimal soulcraft project."""
    os.chdir(tmp_path)
    (tmp_path / "soulcraft.yaml").write_text(
        yaml.dump(
            {
                "target_model": "claude-sonnet-4-6",
                "judge_model": "claude-sonnet-4-6",
                "evaluator_model": "claude-opus-4-6",
                "ideation_model": "claude-sonnet-4-6",
                "prompt": "prompt.md",
            }
        )
    )
    (tmp_path / "prompt.md").write_text("You are a helpful assistant.")
    behaviors_dir = tmp_path / "behaviors"
    behaviors_dir.mkdir()
    (behaviors_dir / "empathy.yaml").write_text(
        yaml.dump(
            {
                "name": "empathy",
                "description": "The model responds with genuine emotional attunement.",
            }
        )
    )


def test_understand_calls_bloom_and_writes_back(tmp_path):
    """soulcraft understand runs bloom understanding and writes results back to behavior YAML."""
    _scaffold_project(tmp_path)

    # Mock Bloom's run_understanding to write a fake understanding.json
    def fake_run_understanding(config=None, config_dir=None, **kwargs):
        results_dir = tmp_path / "bloom-results" / "empathy"
        results_dir.mkdir(parents=True, exist_ok=True)
        (results_dir / "understanding.json").write_text(
            json.dumps(
                {
                    "understanding": "Empathy involves perspective-taking.",
                    "scientific_motivation": "Research shows empathic AI improves outcomes.",
                    "transcript_analyses": [],
                }
            )
        )

    with patch("soulcraft.bloom.run_understanding", fake_run_understanding):
        runner = CliRunner()
        result = runner.invoke(main, ["understand", "empathy"], catch_exceptions=False)

    assert result.exit_code == 0, result.output

    # Understanding should be written back to behavior YAML
    behavior = yaml.safe_load((tmp_path / "behaviors" / "empathy.yaml").read_text())
    assert behavior["understanding"] == "Empathy involves perspective-taking."
    assert behavior["scientific_motivation"] == "Research shows empathic AI improves outcomes."

    # Results should be in .bloom/<name>/<date>/
    bloom_dir = tmp_path / ".bloom" / "empathy"
    assert bloom_dir.exists()
    run_dirs = list(bloom_dir.iterdir())
    assert len(run_dirs) == 1
    assert (run_dirs[0] / "understanding.json").exists()


def test_test_runs_ideation_rollout_judgment(tmp_path):
    """soulcraft test runs the full eval pipeline for a behavior."""
    _scaffold_project(tmp_path)

    # Pre-fill understanding so test skips that stage
    behavior_file = tmp_path / "behaviors" / "empathy.yaml"
    behavior_file.write_text(
        yaml.dump(
            {
                "name": "empathy",
                "description": "The model responds with genuine emotional attunement.",
                "understanding": "Empathy involves perspective-taking.",
                "scientific_motivation": "Research shows empathic AI improves outcomes.",
            }
        )
    )

    stages_called = []

    def fake_stage(stage_name, is_async=False):
        def impl(config=None, config_dir=None, **kwargs):
            stages_called.append(stage_name)
            results_dir = tmp_path / "bloom-results" / "empathy"
            results_dir.mkdir(parents=True, exist_ok=True)
            if stage_name == "understanding":
                (results_dir / "understanding.json").write_text(
                    json.dumps({"understanding": "test", "scientific_motivation": "test", "transcript_analyses": []})
                )
            elif stage_name == "ideation":
                (results_dir / "ideation.json").write_text(json.dumps({"variations": []}))

        async def async_impl(config=None, config_dir=None, **kwargs):
            impl(config=config, config_dir=config_dir, **kwargs)
            if stage_name == "rollout":
                results_dir = tmp_path / "bloom-results" / "empathy"
                transcript_path = results_dir / "transcript_v1r1.json"
                transcript_path.write_text(json.dumps({"events": []}))
                callback = kwargs.get("on_transcript_saved")
                if callback:
                    callback(str(transcript_path), 1, "Test variation", 1)

        return async_impl if is_async else impl

    async def fake_judge_transcript(ctx, transcript_path, variation_number, variation_description, repetition_number):
        stages_called.append("judgment")
        return {
            "variation_number": variation_number,
            "repetition_number": repetition_number,
            "behavior_presence": 7,
            "summary": "Solid",
            "justification": "Good",
        }

    async def fake_compile(ctx, judgments, failed_judgments, total_conversations):
        results_dir = tmp_path / "bloom-results" / "empathy"
        (results_dir / "judgment.json").write_text(
            json.dumps({"judgments": judgments, "summary_statistics": {"average_behavior_presence_score": 7.5}})
        )
        return {"judgments": judgments, "summary_statistics": {"average_behavior_presence_score": 7.5}}

    def fake_prepare(_config):
        stages_called.append("prepare_judgment")

        class DummyExecutor:
            def shutdown(self, wait=True):
                stages_called.append("shutdown_executor")

        return {"executor": DummyExecutor()}

    with (
        patch("soulcraft.bloom.run_understanding", fake_stage("understanding")),
        patch("soulcraft.bloom.run_ideation", fake_stage("ideation")),
        patch("soulcraft.bloom.run_rollout", fake_stage("rollout", is_async=True)),
        patch("soulcraft.bloom.step4_judgment.prepare_judgment_context", fake_prepare),
        patch("soulcraft.bloom.step4_judgment.judge_transcript", fake_judge_transcript),
        patch("soulcraft.bloom.step4_judgment.compile_judgment_results", fake_compile),
    ):
        runner = CliRunner()
        result = runner.invoke(main, ["test", "empathy"], catch_exceptions=False)

    assert result.exit_code == 0, result.output

    # Should run ideation, rollout, and incremental judgment
    assert "ideation" in stages_called
    assert "rollout" in stages_called
    assert "prepare_judgment" in stages_called
    assert "judgment" in stages_called

    # Results should be archived in .bloom/<name>/<date>/
    bloom_dir = tmp_path / ".bloom" / "empathy"
    assert bloom_dir.exists()


def _make_results(tmp_path, behavior="empathy", run_date=None):
    """Create minimal .bloom results for CLI tests."""
    from datetime import date as date_mod

    run_date = run_date or date_mod.today().isoformat()
    run_dir = tmp_path / ".bloom" / behavior / run_date
    run_dir.mkdir(parents=True, exist_ok=True)

    (run_dir / "ideation.json").write_text(
        json.dumps({"variations": [{"description": "Scenario about workplace stress", "tools": []}]})
    )
    (run_dir / "transcript_v1r1.json").write_text(
        json.dumps(
            {
                "metadata": {},
                "events": [
                    {
                        "type": "transcript_event",
                        "view": ["target"],
                        "edit": {"operation": "add", "message": {"role": "user", "content": "I'm stressed"}},
                    },
                    {
                        "type": "transcript_event",
                        "view": ["target"],
                        "edit": {
                            "operation": "add",
                            "message": {"role": "assistant", "content": "I hear you."},
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
                        "summary": "Good empathic response.",
                        "justification": "Model acknowledged feelings first.",
                    }
                ],
                "summary_statistics": {"average_behavior_presence_score": 7.0},
            }
        )
    )
    return run_dir


def test_results_index(tmp_path):
    """soulcraft results shows index with scores."""
    _scaffold_project(tmp_path)
    _make_results(tmp_path)

    runner = CliRunner()
    result = runner.invoke(main, ["results", "empathy"], catch_exceptions=False)

    assert result.exit_code == 0, result.output
    assert "7.0/10" in result.output
    assert "scenario" in result.output.lower()


def test_results_single_scenario(tmp_path):
    """soulcraft results empathy <slug> shows full transcript."""
    _scaffold_project(tmp_path)
    _make_results(tmp_path)

    runner = CliRunner()
    result = runner.invoke(main, ["results", "empathy", "scenario-about-workplace-stress"], catch_exceptions=False)

    assert result.exit_code == 0, result.output
    assert "<Transcript>" in result.output
    assert "<Judgment>" in result.output


def test_results_full(tmp_path):
    """soulcraft results empathy --full shows all scenarios expanded."""
    _scaffold_project(tmp_path)
    _make_results(tmp_path)

    runner = CliRunner()
    result = runner.invoke(main, ["results", "empathy", "--full"], catch_exceptions=False)

    assert result.exit_code == 0, result.output
    assert "<Scenario" in result.output
    assert "<Transcript>" in result.output


def test_results_historical_date(tmp_path):
    """soulcraft results empathy --date shows a specific historical run."""
    _scaffold_project(tmp_path)
    _make_results(tmp_path, run_date="2026-03-25")
    _make_results(tmp_path, run_date="2026-03-26")

    runner = CliRunner()
    result = runner.invoke(main, ["results", "empathy", "--date", "2026-03-25"], catch_exceptions=False)

    assert result.exit_code == 0, result.output
    assert "7.0/10" in result.output
