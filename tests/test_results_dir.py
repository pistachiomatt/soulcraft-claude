import json
from datetime import date
from pathlib import Path

from soulcraft.bloom import prepare_bloom_dirs, archive_bloom_results


def test_prepare_bloom_dirs_creates_structure(tmp_path):
    """prepare_bloom_dirs creates .bloom/<name>/<date>/ and a bloom-results symlink."""
    bloom_run_dir, results_symlink = prepare_bloom_dirs(tmp_path, "empathy")

    today = date.today().isoformat()
    assert bloom_run_dir == tmp_path / ".bloom" / "empathy" / today
    assert bloom_run_dir.is_dir()

    # bloom-results/<name> should be a symlink pointing into .bloom/<name>/<date>
    expected_symlink = tmp_path / "bloom-results" / "empathy"
    assert expected_symlink.is_symlink()
    assert expected_symlink.resolve() == bloom_run_dir.resolve()


def test_prepare_bloom_dirs_appends_suffix_on_same_day(tmp_path):
    """Running twice on the same day creates <date>-2, <date>-3, etc."""
    first_dir, _ = prepare_bloom_dirs(tmp_path, "empathy")
    second_dir, _ = prepare_bloom_dirs(tmp_path, "empathy")

    today = date.today().isoformat()
    assert first_dir.name == today
    assert second_dir.name == f"{today}-2"
    assert second_dir.is_dir()


def test_archive_bloom_results_cleans_up_symlink(tmp_path):
    """After a run, archive removes the bloom-results symlink."""
    bloom_run_dir, _ = prepare_bloom_dirs(tmp_path, "empathy")

    # Simulate bloom writing a result file
    (bloom_run_dir / "judgment.json").write_text(json.dumps({"score": 7}))

    archive_bloom_results(tmp_path, "empathy")

    # Symlink should be gone
    assert not (tmp_path / "bloom-results" / "empathy").exists()

    # But the actual results remain
    assert (bloom_run_dir / "judgment.json").exists()


def test_symlink_works_with_relative_project_dir(tmp_path):
    """Symlink must resolve correctly even when project_dir is relative.

    Bug: if project_dir is relative (e.g. 'evals/test-ai'), symlink_to(run_dir)
    creates a relative symlink target. Since the symlink lives under bloom-results/
    (different parent than .bloom/), the relative path doesn't resolve.
    """
    import os

    # Create a project dir, then reference it relatively
    project_abs = tmp_path / "projects" / "my-ai"
    project_abs.mkdir(parents=True)

    os.chdir(tmp_path)
    project_rel = Path("projects/my-ai")

    run_dir, symlink = prepare_bloom_dirs(project_rel, "empathy")

    # The symlink must actually resolve to the run_dir
    assert symlink.resolve() == run_dir.resolve()

    # Writing through the symlink must land in run_dir
    test_file = symlink / "test.json"
    test_file.write_text('{"ok": true}')
    assert (run_dir / "test.json").exists()
    assert json.loads((run_dir / "test.json").read_text())["ok"] is True


def test_run_test_chdirs_to_project_before_calling_bloom(tmp_path):
    """run_test must chdir to project_dir so Bloom's relative bloom-results/ lands correctly.

    Bug: soulcraft claude does os.chdir(soulcraft-claude/). Then the artisan calls
    soulcraft test, which calls Bloom. Bloom writes to bloom-results/{name} relative
    to cwd — which is now soulcraft-claude/, not the project dir.
    """
    import os
    from unittest.mock import patch

    from soulcraft.bloom import run_test
    from soulcraft.config import BehaviorConfig, ProjectConfig

    project_dir = tmp_path / "consumer"
    project_dir.mkdir()
    (project_dir / "prompt.md").write_text("You are helpful.")

    other_dir = tmp_path / "soulcraft-claude"
    other_dir.mkdir()

    behavior = BehaviorConfig(
        name="empathy",
        description="Test.",
        understanding="Pre-filled.",
        scientific_motivation="Pre-filled.",
    )
    project = ProjectConfig(
        target_model="x", judge_model="x", evaluator_model="x",
        ideation_model="x", prompt=Path("prompt.md"), project_dir=project_dir,
    )

    cwd_during_bloom = []

    def fake_ideation(config=None, config_dir=None, **kw):
        cwd_during_bloom.append(os.getcwd())
        results = Path("bloom-results/empathy")
        results.mkdir(parents=True, exist_ok=True)
        (results / "ideation.json").write_text(json.dumps({"variations": []}))

    async def fake_rollout(config=None, config_dir=None, **kw):
        cwd_during_bloom.append(os.getcwd())

    async def fake_judgment(config=None, config_dir=None, **kw):
        cwd_during_bloom.append(os.getcwd())
        results = Path("bloom-results/empathy")
        results.mkdir(parents=True, exist_ok=True)
        (results / "judgment.json").write_text(
            json.dumps({"judgments": [], "summary_statistics": {"average_behavior_presence_score": 7}})
        )

    # Start from a DIFFERENT cwd (simulating soulcraft claude)
    os.chdir(other_dir)

    with (
        patch("soulcraft.bloom.run_ideation", fake_ideation),
        patch("soulcraft.bloom.run_rollout", fake_rollout),
        patch("soulcraft.bloom.run_judgment", fake_judgment),
    ):
        run_test(project, behavior)

    # Bloom must have run with cwd == project_dir
    for cwd in cwd_during_bloom:
        assert cwd == str(project_dir.resolve()), \
            f"Bloom ran with cwd={cwd}, expected {project_dir.resolve()}"


def test_prepare_bloom_dirs_does_not_delete_previous_run_data(tmp_path):
    """prepare_bloom_dirs must not destroy data from previous runs.

    When bloom-results/<name> is a stale real directory (from a crashed run),
    prepare_bloom_dirs removes it to create the symlink. But it must NEVER
    remove .bloom/<name>/<date>/ directories — those hold previous results.
    """
    # Simulate a previous run's results in .bloom/
    prev_run = tmp_path / ".bloom" / "empathy" / "2026-03-25"
    prev_run.mkdir(parents=True)
    (prev_run / "judgment.json").write_text(json.dumps({"score": 8}))
    (prev_run / "transcript_v1r1.json").write_text(json.dumps({"events": []}))

    # Simulate a stale real directory left by a crashed run
    stale_dir = tmp_path / "bloom-results" / "empathy"
    stale_dir.mkdir(parents=True)
    (stale_dir / "understanding.json").write_text("stale")

    # prepare_bloom_dirs should remove the stale dir and create a fresh symlink
    run_dir, symlink = prepare_bloom_dirs(tmp_path, "empathy")

    # New symlink works
    assert symlink.is_symlink()
    assert symlink.resolve() == run_dir.resolve()

    # Previous run data is untouched
    assert (prev_run / "judgment.json").exists()
    assert json.loads((prev_run / "judgment.json").read_text())["score"] == 8
    assert (prev_run / "transcript_v1r1.json").exists()

    # Stale content is gone (it was in bloom-results/, not .bloom/)
    assert not (stale_dir / "understanding.json").exists() or symlink.resolve() != stale_dir
