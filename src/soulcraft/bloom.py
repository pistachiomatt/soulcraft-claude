import asyncio
import json
import os
from pathlib import Path
from typing import Any

import yaml

from bloom.stages.step1_understanding import run_understanding
from bloom.stages.step2_ideation import run_ideation
from bloom.stages.step3_rollout import run_rollout
from bloom.stages import step4_judgment
from bloom.stages.step4_judgment import run_judgment
from bloom.tool_handlers import BUILTIN_SCHEMAS

from soulcraft.config import BehaviorConfig, ProjectConfig, load_scenarios


def resolve_tools(behavior: BehaviorConfig, project_dir: Path) -> list[dict]:
    """Resolve tool references to full definitions.

    Tools can be:
    - A string matching a Bloom builtin (Read, Write, etc.) → handler: builtin
    - A string matching a key in tools.yaml → full definition from that file
    - A dict → used as-is (inline definition)
    """
    if not behavior.tools:
        return []

    # Lazy-load tools.yaml
    shared_tools = {}
    tools_path = project_dir / "tools.yaml"
    if tools_path.exists():
        raw = yaml.safe_load(tools_path.read_text()) or {}
        # Skip the top-level name/description metadata
        shared_tools = {k: v for k, v in raw.items() if isinstance(v, dict) and k not in ("name", "description")}

    resolved = []
    for tool in behavior.tools:
        if isinstance(tool, str):
            if tool in BUILTIN_SCHEMAS:
                resolved.append({"handler": "builtin", "function": {"name": tool}})
            elif tool in shared_tools:
                resolved.append(shared_tools[tool])
            else:
                raise ValueError(f"Unknown tool '{tool}' — not a builtin and not in tools.yaml")
        elif isinstance(tool, dict):
            resolved.append(tool)
        else:
            raise ValueError(f"Invalid tool definition: {tool}")

    return resolved


def generate_seed_config(project: ProjectConfig, behavior: BehaviorConfig) -> dict[str, Any]:
    tools = resolve_tools(behavior, project.project_dir)
    modality = "simenv" if tools else "conversation"
    target_reasoning = behavior.target_reasoning_effort or project.rollout.target_reasoning_effort

    seed: dict[str, Any] = {
        "behavior": {
            "name": behavior.name,
            "examples": behavior.examples,
        },
        "temperature": 1.0,
        "evaluator_reasoning_effort": project.rollout.evaluator_reasoning_effort,
        "target_reasoning_effort": target_reasoning,
        "max_concurrent": project.rollout.max_concurrent,
        "anonymous_target": False,
        "use_fixed_target_prompt": True,
        "understanding": {
            "model": project.evaluator_model,
            "max_tokens": 16000,
        },
        "ideation": {
            "model": project.ideation_model,
            "total_evals": project.ideation.total_evals,
            "diversity": project.ideation.diversity,
            "max_tokens": 12000,
        },
        "rollout": {
            "model": project.evaluator_model,
            "target": project.target_model,
            "modality": modality,
            "max_turns": project.rollout.max_turns,
            "max_tokens": 16000,
            "num_reps": behavior.repetitions,
            **({"tool_simulation_model": project.tool_simulation_model} if project.tool_simulation_model else {}),
        },
        "judgment": {
            "model": project.judge_model,
            "max_tokens": 16000,
            "num_samples": 1,
            "additional_qualities": project.judgment.additional_qualities,
        },
    }

    if tools:
        seed["tools"] = tools

    return seed


def _resolve_prompt_file(file_path: str, project_dir: Path, soulcraft_root: Path) -> Path:
    """Resolve a prompt file path. Checks: absolute → project dir → soulcraft root."""
    p = Path(file_path)
    if p.is_absolute() and p.exists():
        return p
    if (project_dir / p).exists():
        return (project_dir / p).resolve()
    if (soulcraft_root / p).exists():
        return (soulcraft_root / p).resolve()
    raise FileNotFoundError(
        f"Prompt file not found: {file_path}\n"
        f"  Looked in: {project_dir}, {soulcraft_root}"
    )


def _write_configurable_prompts(project_dir: Path, prompts_data: dict[str, Any]) -> None:
    """Write configurable_prompts/default.json with all prompt overrides for Bloom."""
    prompts_dir = project_dir / "configurable_prompts"
    prompts_dir.mkdir(exist_ok=True)
    prompts_file = prompts_dir / "default.json"

    existing = {}
    if prompts_file.exists():
        existing = json.loads(prompts_file.read_text())

    existing.update(prompts_data)
    prompts_file.write_text(json.dumps(existing, indent=2))


def prepare_bloom_dirs(project_dir: Path, behavior_name: str) -> tuple[Path, Path]:
    from datetime import date

    today = date.today().isoformat()
    project_dir = project_dir.resolve()
    bloom_dir = project_dir / ".bloom" / behavior_name

    # Find a unique run dir for today
    run_dir = bloom_dir / today
    if run_dir.exists():
        suffix = 2
        while (bloom_dir / f"{today}-{suffix}").exists():
            suffix += 1
        run_dir = bloom_dir / f"{today}-{suffix}"

    run_dir.mkdir(parents=True, exist_ok=True)

    # Create bloom-results/<name> symlink pointing to our run dir
    # This is where Bloom will write its output
    bloom_results = project_dir / "bloom-results" / behavior_name
    bloom_results.parent.mkdir(parents=True, exist_ok=True)
    if bloom_results.is_symlink():
        bloom_results.unlink()
    elif bloom_results.is_dir():
        import shutil
        shutil.rmtree(bloom_results)
    bloom_results.symlink_to(run_dir)

    return run_dir, bloom_results


def archive_bloom_results(project_dir: Path, behavior_name: str) -> None:
    import shutil

    target = project_dir / "bloom-results" / behavior_name
    if target.is_symlink():
        target.unlink()
    elif target.is_dir():
        # Stale real directory (from interrupted run or Bloom recreating it)
        shutil.rmtree(target)

    # Clean up bloom-results dir if empty
    bloom_results_dir = project_dir / "bloom-results"
    if bloom_results_dir.exists() and not any(bloom_results_dir.iterdir()):
        bloom_results_dir.rmdir()


def _bloom_config_dir(project_dir: Path) -> Path:
    """The directory where we write all bridge files for Bloom."""
    d = (project_dir / ".bloom").resolve()
    d.mkdir(exist_ok=True)
    return d


def _write_bloom_models_json(project_dir: Path, project: ProjectConfig) -> None:
    """Write a models.json so Bloom can resolve model short names to LiteLLM IDs."""
    models_path = _bloom_config_dir(project_dir) / "models.json"
    existing = {}
    if models_path.exists():
        existing = json.loads(models_path.read_text())

    all_models = {
        project.target_model,
        project.judge_model,
        project.evaluator_model,
        project.ideation_model,
    }
    if project.tool_simulation_model:
        all_models.add(project.tool_simulation_model)

    for model in all_models:
        if model in existing:
            continue
        if "/" in model:
            existing[model] = {"id": model, "org": model.split("/")[0], "name": model}
        else:
            provider = "anthropic" if "claude" in model.lower() else project.provider
            litellm_id = f"{provider}/{model}"
            existing[model] = {"id": litellm_id, "org": provider, "name": model}

    models_path.write_text(json.dumps(existing, indent=2))


def _write_bloom_behaviors_json(project_dir: Path, behavior: BehaviorConfig) -> None:
    """Write a behaviors.json so Bloom can look up our custom behavior description."""
    behaviors_path = _bloom_config_dir(project_dir) / "behaviors.json"
    existing = {}
    if behaviors_path.exists():
        existing = json.loads(behaviors_path.read_text())
    existing[behavior.name] = behavior.description
    behaviors_path.write_text(json.dumps(existing, indent=2))


def _prepare_bloom_env(project: ProjectConfig, behavior: BehaviorConfig) -> None:
    """Write all the bridge files Bloom needs to find our config."""
    _write_bloom_behaviors_json(project.project_dir, behavior)
    _write_bloom_models_json(project.project_dir, project)

    # Read prompt.md and pass it as the target's system prompt
    prompt_path = project.project_dir / project.prompt
    if not prompt_path.exists():
        raise FileNotFoundError(f"Prompt file not found: {project.prompt}\nThis is the system prompt you're testing — create it or update 'prompt' in soulcraft.yaml.")

    prompts_data: dict[str, str] = {"target_sysprompt_prefix": prompt_path.read_text()}

    # Read custom evaluator prompts if configured
    # Resolution order: absolute path → relative to project dir → relative to soulcraft root
    soulcraft_root = Path(__file__).resolve().parent.parent.parent
    prompt_file_mappings = {
        "evaluator_system_prompt": "rollout_system_prompt",
        "scenario_context_template": "scenario_context_prompt",
        "target_response_format": "target_response_format",
    }
    for config_key, bloom_key in prompt_file_mappings.items():
        file_path = getattr(project.rollout, config_key, None)
        if file_path:
            resolved = _resolve_prompt_file(file_path, project.project_dir, soulcraft_root)
            prompts_data[bloom_key] = resolved.read_text()

    # When a custom evaluator system prompt is set, suppress Bloom's default
    # kickoff boilerplate ("You are now simulating the user...")
    if project.rollout.evaluator_system_prompt:
        prompts_data["rollout_kickoff"] = False  # type: ignore[assignment]

    _write_configurable_prompts(_bloom_config_dir(project.project_dir), prompts_data)


def run_understand(project: ProjectConfig, behavior: BehaviorConfig) -> dict[str, Any]:
    seed = generate_seed_config(project, behavior)
    run_dir, _ = prepare_bloom_dirs(project.project_dir, behavior.name)
    _prepare_bloom_env(project, behavior)

    old_cwd = os.getcwd()
    os.chdir(project.project_dir.resolve())
    try:
        run_understanding(config=seed, config_dir=str(_bloom_config_dir(project.project_dir)))

        results = json.loads((run_dir / "understanding.json").read_text())
        _write_understanding_to_behavior(behavior, results)
        return results
    finally:
        archive_bloom_results(project.project_dir, behavior.name)
        os.chdir(old_cwd)


def _write_understanding_to_behavior(behavior: BehaviorConfig, results: dict[str, Any]) -> None:
    if not behavior.file_path:
        return

    raw = yaml.safe_load(behavior.file_path.read_text())
    raw["understanding"] = results.get("understanding")
    raw["scientific_motivation"] = results.get("scientific_motivation")
    behavior.file_path.write_text(yaml.dump(raw, default_flow_style=False, sort_keys=False))


def _prepend_fixed_scenarios(project: ProjectConfig, behavior: BehaviorConfig, run_dir: Path) -> None:
    fixed = load_scenarios(project.project_dir, behavior)
    if not fixed:
        return

    ideation_path = run_dir / "ideation.json"
    if not ideation_path.exists():
        return

    results = json.loads(ideation_path.read_text())
    results["variations"] = fixed + results.get("variations", [])
    ideation_path.write_text(json.dumps(results, indent=2))


async def _run_rollout_with_incremental_judgment(
    seed: dict[str, Any],
    config_dir: str,
    judgment_max_concurrent: int,
) -> dict[str, Any]:
    judgment_config = dict(seed)
    judgment_config["_config_dir"] = Path(config_dir)
    judgment_config["max_concurrent"] = judgment_max_concurrent

    judgment_ctx = step4_judgment.prepare_judgment_context(judgment_config)
    judgment_tasks: list[asyncio.Task] = []
    total_transcripts = 0

    def on_transcript_saved(
        transcript_path: str,
        variation_number: int,
        variation_description: str,
        repetition_number: int,
    ) -> None:
        nonlocal total_transcripts
        total_transcripts += 1
        judgment_tasks.append(
            asyncio.create_task(
                step4_judgment.judge_transcript(
                    judgment_ctx,
                    transcript_path,
                    variation_number,
                    variation_description,
                    repetition_number,
                )
            )
        )

    try:
        await run_rollout(
            config=seed,
            config_dir=config_dir,
            on_transcript_saved=on_transcript_saved,
        )

        judgments: list[dict[str, Any]] = []
        failed_judgments: list[dict[str, Any]] = []

        if judgment_tasks:
            results = await asyncio.gather(*judgment_tasks, return_exceptions=True)
            for result in results:
                if isinstance(result, Exception):
                    failed_judgments.append(
                        {
                            "error": str(result),
                            "error_type": type(result).__name__,
                        }
                    )
                else:
                    result.pop("_duration", None)
                    judgments.append(result)

        final = await step4_judgment.compile_judgment_results(
            judgment_ctx,
            judgments,
            failed_judgments,
            total_transcripts,
        )
        return final or {}
    finally:
        judgment_ctx["executor"].shutdown(wait=True)


def run_test(project: ProjectConfig, behavior: BehaviorConfig) -> dict[str, Any]:
    seed = generate_seed_config(project, behavior)
    run_dir, _ = prepare_bloom_dirs(project.project_dir, behavior.name)
    _prepare_bloom_env(project, behavior)

    # Bloom writes to bloom-results/{name} relative to cwd
    old_cwd = os.getcwd()
    os.chdir(project.project_dir.resolve())
    try:
        if behavior.understanding:
            (run_dir / "understanding.json").write_text(
                json.dumps(
                    {
                        "understanding": behavior.understanding,
                        "scientific_motivation": behavior.scientific_motivation or "",
                        "transcript_analyses": [],
                    }
                )
            )
        else:
            run_understanding(config=seed, config_dir=str(_bloom_config_dir(project.project_dir)))
            results = json.loads((run_dir / "understanding.json").read_text())
            _write_understanding_to_behavior(behavior, results)

        config_dir = str(_bloom_config_dir(project.project_dir))
        run_ideation(config=seed, config_dir=config_dir)
        _prepend_fixed_scenarios(project, behavior, run_dir)
        return asyncio.run(
            _run_rollout_with_incremental_judgment(
                seed=seed,
                config_dir=config_dir,
                judgment_max_concurrent=project.judgment.max_concurrent,
            )
        )
    finally:
        archive_bloom_results(project.project_dir, behavior.name)
        os.chdir(old_cwd)
