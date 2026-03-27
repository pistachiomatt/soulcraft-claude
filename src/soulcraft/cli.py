import os
import shutil
from importlib import resources
from pathlib import Path

import click


TEMPLATES = resources.files("soulcraft") / "templates"


def _load_env(project_dir: Path) -> None:
    """Load .env from project dir and set base_url from soulcraft.yaml."""
    env_file = project_dir / ".env"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip())

    import yaml

    config_path = project_dir / "soulcraft.yaml"
    if config_path.exists():
        raw = yaml.safe_load(config_path.read_text())
        base_url = raw.get("base_url")
        if base_url:
            os.environ.setdefault("ANTHROPIC_API_BASE", base_url)


def _get_project_dir(ctx: click.Context) -> Path:
    """Get project dir from click context (--project-dir or cwd)."""
    return Path(ctx.obj or Path.cwd())


@click.group()
@click.option("--project-dir", "project_dir", default=None, type=click.Path(exists=True),
              help="Project directory (defaults to current directory).")
@click.pass_context
def main(ctx, project_dir: str | None):
    """Soulcraft — system prompt development through behavioral evaluation."""
    ctx.ensure_object(dict)
    ctx.obj = Path(project_dir).resolve() if project_dir else None


@main.command()
@click.pass_context
def init(ctx):
    """Scaffold a new soulcraft project in the current directory."""
    project_dir = _get_project_dir(ctx)

    files_to_copy = [
        ("soulcraft.yaml", "soulcraft.yaml"),
        ("prompt.md", "prompt.md"),
    ]

    for src_name, dst_name in files_to_copy:
        dst = project_dir / dst_name
        if dst.exists():
            click.echo(f"  Skipping {dst_name} (already exists)")
        else:
            src = TEMPLATES / src_name
            shutil.copy2(src, dst)
            click.echo(f"  Created {dst_name}")

    behaviors_dir = project_dir / "behaviors"
    if not behaviors_dir.exists():
        behaviors_dir.mkdir()
        click.echo("  Created behaviors/")

        sample_src = TEMPLATES / "behaviors" / "sample-behavior.yaml"
        if sample_src.exists():
            shutil.copy2(sample_src, behaviors_dir / "sample-behavior.yaml")
            click.echo("  Created behaviors/sample-behavior.yaml")
    else:
        click.echo("  Skipping behaviors/ (already exists)")

    scenarios_dir = project_dir / "scenarios"
    if not scenarios_dir.exists():
        scenarios_dir.mkdir()
        click.echo("  Created scenarios/")
    else:
        click.echo("  Skipping scenarios/ (already exists)")

    click.echo("\nReady! Edit soulcraft.yaml and add behaviors to get started.")


@main.command()
@click.argument("name")
@click.pass_context
def add(ctx, name: str):
    """Create a new behavior YAML."""
    project_dir = _get_project_dir(ctx)
    behaviors_dir = project_dir / "behaviors"
    behavior_file = behaviors_dir / f"{name}.yaml"

    if behavior_file.exists():
        click.echo(f"  behaviors/{name}.yaml already exists")
        return

    if not behaviors_dir.exists():
        behaviors_dir.mkdir()

    import yaml

    content = {
        "name": name,
        "description": f"Describe the {name} behavior you want your AI to embody.\n",
        "examples": [],
    }
    behavior_file.write_text(yaml.dump(content, default_flow_style=False, sort_keys=False))
    click.echo(f"  Created behaviors/{name}.yaml — edit the description to get started.")


@main.command()
@click.argument("behavior")
@click.pass_context
def understand(ctx, behavior: str):
    """Run deep understanding of a behavior (academic research + scoring rubric)."""
    from soulcraft.bloom import run_understand
    from soulcraft.config import load_behavior, load_project_config

    project_dir = _get_project_dir(ctx)
    _load_env(project_dir)
    project = load_project_config(project_dir)
    behavior_path = project_dir / "behaviors" / f"{behavior}.yaml"

    if not behavior_path.exists():
        click.echo(f"  Behavior not found: behaviors/{behavior}.yaml")
        raise SystemExit(1)

    behavior_config = load_behavior(behavior_path)
    click.echo(f"  Understanding: {behavior_config.name}")

    run_understand(project, behavior_config)

    click.echo(f"  Understanding written to behaviors/{behavior}.yaml")
    click.echo("  Scientific motivation captured.")


@main.command()
@click.argument("behavior", required=False)
@click.pass_context
def test(ctx, behavior: str | None):
    """Run eval pipeline: ideation, rollout, judgment."""
    from soulcraft.bloom import run_test
    from soulcraft.config import load_behavior, load_behaviors, load_project_config

    project_dir = _get_project_dir(ctx)
    _load_env(project_dir)
    project = load_project_config(project_dir)

    if behavior:
        behavior_path = project_dir / "behaviors" / f"{behavior}.yaml"
        if not behavior_path.exists():
            click.echo(f"  Behavior not found: behaviors/{behavior}.yaml")
            raise SystemExit(1)
        behaviors = [load_behavior(behavior_path)]
    else:
        behaviors = load_behaviors(project_dir)

    if not behaviors:
        click.echo("  No behaviors found. Run `soulcraft add <name>` first.")
        raise SystemExit(1)

    for b in behaviors:
        click.echo(f"  Testing: {b.name}")
        results = run_test(project, b)

        stats = results.get("summary_statistics", {})
        avg = stats.get("average_behavior_presence_score")
        if avg is not None:
            click.echo(f"  Score: {avg}/10")
        click.echo()


@main.command()
@click.argument("behavior")
@click.argument("scenario", required=False)
@click.option("--full", is_flag=True, help="Show all scenarios with full transcripts.")
@click.option("--date", "run_date", default=None, help="View a historical run by date (e.g. 2026-03-25).")
@click.pass_context
def results(ctx, behavior: str, scenario: str | None, full: bool, run_date: str | None):
    """Show results from eval runs.

    \b
    Three zoom levels:
      soulcraft results empathy                     Index: one line per scenario
      soulcraft results empathy grief-support        Single scenario with full transcript
      soulcraft results empathy --full               All scenarios with full transcripts
    """
    from soulcraft.results import format_full, format_index, format_scenario, load_run

    project_dir = _get_project_dir(ctx)
    run = load_run(project_dir, behavior, run_date=run_date)

    if not run:
        click.echo(f"  No results for: {behavior}")
        if run_date:
            click.echo(f"  (looked for run on {run_date})")
        raise SystemExit(1)

    if scenario:
        click.echo(format_scenario(run, scenario))
    elif full:
        click.echo(format_full(run))
    else:
        previous_run = _load_previous_run(project_dir, behavior, run["run_date"])
        click.echo(format_index(run, previous_run=previous_run))


def _load_previous_run(project_dir: Path, behavior: str, current_date: str):
    """Load the run before the current one for delta calculation."""
    from soulcraft.results import load_run

    bloom_dir = project_dir / ".bloom" / behavior
    if not bloom_dir.exists():
        return None

    run_dirs = sorted(d.name for d in bloom_dir.iterdir() if d.is_dir())
    try:
        idx = run_dirs.index(current_date)
    except ValueError:
        return None

    if idx == 0:
        return None

    return load_run(project_dir, behavior, run_date=run_dirs[idx - 1])


def _find_soulcraft_root() -> Path:
    """Find soulcraft's installation root (where soulcraft-claude/ lives)."""
    # Walk up from this file to find the repo root
    here = Path(__file__).resolve()
    # __file__ is src/soulcraft/cli.py → repo root is 3 levels up
    candidate = here.parent.parent.parent
    if (candidate / "soulcraft-claude").is_dir():
        return candidate
    raise FileNotFoundError(
        "Could not find soulcraft-claude/ directory. "
        "Ensure soulcraft is installed from the git repo, not just pip."
    )


def _strip_frontmatter(text: str) -> str:
    """Remove YAML frontmatter (--- ... ---) from the start of a file."""
    if not text.startswith("---"):
        return text
    end = text.find("---", 3)
    if end == -1:
        return text
    return text[end + 3:].lstrip("\n")


def _compose_claude_md(soulcraft_root: Path, operating_dir: Path) -> str:
    """Compose the artisan's CLAUDE.md by substituting template vars."""
    template = (soulcraft_root / "soulcraft-claude" / "CLAUDE.md").read_text()
    skill_path = soulcraft_root / "soulcraft-claude" / ".claude" / "skills" / "soulcraft" / "SKILL.md"
    skill_content = _strip_frontmatter(skill_path.read_text()) if skill_path.exists() else ""

    soulcraft_bin = "soulcraft-dev" if shutil.which("soulcraft-dev") else "soulcraft"
    soulcraft_command = f"{soulcraft_bin} --project-dir {operating_dir}"

    composed = template.replace("{{skill_content}}", skill_content)
    return (
        composed
        .replace("{{soulcraft_command}}", soulcraft_command)
        .replace("{{operating_dir}}", str(operating_dir))
    )


@main.command(name="claude", context_settings={"ignore_unknown_options": True, "allow_extra_args": True})
@click.pass_context
def claude_cmd(ctx):
    """Launch Claude Code as a prompt artisan for this project.

    Any extra flags are passed through to claude (e.g. --model, --verbose).
    """
    import tempfile

    operating_dir = _get_project_dir(ctx)
    soulcraft_root = _find_soulcraft_root()
    claude_dir = soulcraft_root / "soulcraft-claude"

    # Load consumer's env so Claude inherits API keys
    env_file = operating_dir / ".env"
    if not env_file.exists():
        click.echo(f"  Missing .env in {operating_dir}")
        click.echo("  Create one with at least ANTHROPIC_API_KEY=<key>")
        raise SystemExit(1)
    _load_env(operating_dir)

    composed = _compose_claude_md(soulcraft_root, operating_dir)

    # Write composed CLAUDE.md to a temp file
    with tempfile.NamedTemporaryFile(mode="w", suffix=".md", delete=False, prefix="soulcraft-claude-") as f:
        f.write(composed)
        system_prompt_file = f.name

    click.echo(f"  Launching artisan Claude for {operating_dir}")
    click.echo(f"  System prompt: {system_prompt_file}")

    # cd into soulcraft-claude/ so Claude Code inherits .claude/ config, then exec
    os.chdir(claude_dir)
    extra_args = ctx.args
    os.execvp("claude", ["claude", "--system-prompt-file", system_prompt_file] + extra_args)


@main.command()
@click.argument("behavior", required=False)
@click.argument("scenario", required=False)
@click.pass_context
def tui(ctx, behavior: str | None, scenario: str | None):
    """Launch the results viewer TUI.

    \b
    Deep link to any level:
      soulcraft tui                        All behaviors
      soulcraft tui empathy                Scenarios for empathy
      soulcraft tui empathy grief-support  Specific scenario
    """
    import subprocess

    project_dir = _get_project_dir(ctx)
    soulcraft_root = _find_soulcraft_root()
    tui_dir = soulcraft_root / "tui"

    if not (tui_dir / "node_modules").exists():
        click.echo("  Installing TUI dependencies...")
        subprocess.run(["npm", "install"], cwd=tui_dir, check=True, capture_output=True)

    args = ["npx", "--prefix", str(tui_dir), "tsx", str(tui_dir / "src" / "index.tsx"), str(project_dir)]
    if behavior:
        args.append(behavior)
    if scenario:
        args.append(scenario)

    os.execvp("npx", args)
