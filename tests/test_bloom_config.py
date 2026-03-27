from pathlib import Path

import yaml

from soulcraft.bloom import _write_configurable_prompts, generate_seed_config
from soulcraft.config import BehaviorConfig, IdeationConfig, JudgmentConfig, ProjectConfig, RolloutConfig


def make_project_config(**overrides) -> ProjectConfig:
    defaults = dict(
        target_model="claude-sonnet-4-6",
        judge_model="claude-sonnet-4-6",
        evaluator_model="claude-opus-4-6",
        ideation_model="claude-sonnet-4-6",
        prompt=Path("prompt.md"),
        project_dir=Path("/tmp/test-project"),
    )
    defaults.update(overrides)
    return ProjectConfig(**defaults)


def make_behavior(**overrides) -> BehaviorConfig:
    defaults = dict(
        name="empathy",
        description="The model responds with genuine emotional attunement.",
    )
    defaults.update(overrides)
    return BehaviorConfig(**defaults)


def test_generates_valid_bloom_seed():
    """Generated seed config has the right Bloom structure."""
    project = make_project_config()
    behavior = make_behavior()

    seed = generate_seed_config(project, behavior)

    assert seed["behavior"]["name"] == "empathy"
    assert seed["rollout"]["target"] == "claude-sonnet-4-6"
    assert seed["rollout"]["model"] == "claude-opus-4-6"
    assert seed["judgment"]["model"] == "claude-sonnet-4-6"
    assert seed["ideation"]["model"] == "claude-sonnet-4-6"
    assert seed["understanding"]["model"] == "claude-opus-4-6"


def test_uses_fixed_target_prompt():
    """We always use fixed target prompt — we're testing a specific prompt."""
    project = make_project_config()
    behavior = make_behavior()

    seed = generate_seed_config(project, behavior)

    assert seed["use_fixed_target_prompt"] is True


def test_modality_inferred_from_tools():
    """Behaviors with tools get simenv modality, otherwise conversation."""
    project = make_project_config()

    no_tools = make_behavior()
    seed = generate_seed_config(project, no_tools)
    assert seed["rollout"]["modality"] == "conversation"

    with_tools = make_behavior(tools=[{"function": {"name": "Read"}}])
    seed = generate_seed_config(project, with_tools)
    assert seed["rollout"]["modality"] == "simenv"


def test_behavior_overrides_project_defaults():
    """Per-behavior settings override project-level defaults."""
    project = make_project_config(
        rollout=RolloutConfig(target_reasoning_effort="medium"),
    )
    behavior = make_behavior(
        target_reasoning_effort="high",
        repetitions=3,
    )

    seed = generate_seed_config(project, behavior)

    assert seed["target_reasoning_effort"] == "high"
    assert seed["rollout"]["num_reps"] == 3


def test_ideation_settings_pass_through():
    """Ideation config from soulcraft.yaml passes through to Bloom."""
    project = make_project_config(
        ideation=IdeationConfig(total_evals=20, diversity=0.5),
    )
    behavior = make_behavior()

    seed = generate_seed_config(project, behavior)

    assert seed["ideation"]["total_evals"] == 20
    assert seed["ideation"]["diversity"] == 0.5


def test_judgment_additional_qualities():
    """Judgment additional_qualities passes through."""
    project = make_project_config(
        judgment=JudgmentConfig(additional_qualities=["realism", "evaluation-awareness"]),
    )
    behavior = make_behavior()

    seed = generate_seed_config(project, behavior)

    assert seed["judgment"]["additional_qualities"] == ["realism", "evaluation-awareness"]


def test_prompt_content_written_to_configurable_prompts(tmp_path):
    """prompt.md content is passed to Bloom as target_sysprompt_prefix."""
    prompt_content = "You are a warm, empathic assistant."
    bloom_dir = tmp_path / ".bloom"
    bloom_dir.mkdir()
    _write_configurable_prompts(bloom_dir, {"target_sysprompt_prefix": prompt_content})

    import json

    prompts_file = tmp_path / ".bloom" / "configurable_prompts" / "default.json"
    assert prompts_file.exists()

    prompts = json.loads(prompts_file.read_text())
    assert prompts["target_sysprompt_prefix"] == prompt_content


def test_evaluator_prompts_injected_from_files(tmp_path):
    """Custom evaluator prompt files from soulcraft.yaml get injected into configurable_prompts."""
    from soulcraft.bloom import _prepare_bloom_env
    from soulcraft.config import ProjectConfig, RolloutConfig

    # Create prompt files
    (tmp_path / "prompt.md").write_text("Target system prompt.")
    prompts_dir = tmp_path / "prompts"
    prompts_dir.mkdir()
    (prompts_dir / "evaluator.md").write_text("You are a realistic human simulator.")
    (prompts_dir / "scenario-context.md").write_text("Scenario: {scenario_description}")
    (prompts_dir / "target-response.md").write_text("<response>{response}</response>")

    # Create a soulcraft.yaml that references them
    project = ProjectConfig(
        target_model="claude-sonnet-4-6",
        judge_model="claude-sonnet-4-6",
        evaluator_model="claude-opus-4-6",
        ideation_model="claude-sonnet-4-6",
        prompt=Path("prompt.md"),
        project_dir=tmp_path,
        rollout=RolloutConfig(
            evaluator_system_prompt="prompts/evaluator.md",
            scenario_context_template="prompts/scenario-context.md",
            target_response_format="prompts/target-response.md",
        ),
    )
    behavior = BehaviorConfig(name="test", description="Test behavior.")

    _prepare_bloom_env(project, behavior)

    prompts_file = tmp_path / ".bloom" / "configurable_prompts" / "default.json"
    assert prompts_file.exists()

    import json
    prompts = json.loads(prompts_file.read_text())

    assert prompts["rollout_system_prompt"] == "You are a realistic human simulator."
    assert prompts["scenario_context_prompt"] == "Scenario: {scenario_description}"
    assert prompts["target_response_format"] == "<response>{response}</response>"
    assert prompts["target_sysprompt_prefix"] == "Target system prompt."


def test_evaluator_prompts_optional(tmp_path):
    """When no custom evaluator prompts are configured, those keys are absent."""
    from soulcraft.bloom import _prepare_bloom_env
    from soulcraft.config import ProjectConfig

    (tmp_path / "prompt.md").write_text("Target system prompt.")

    project = ProjectConfig(
        target_model="claude-sonnet-4-6",
        judge_model="claude-sonnet-4-6",
        evaluator_model="claude-opus-4-6",
        ideation_model="claude-sonnet-4-6",
        prompt=Path("prompt.md"),
        project_dir=tmp_path,
    )
    behavior = BehaviorConfig(name="test", description="Test behavior.")

    _prepare_bloom_env(project, behavior)

    import json
    prompts = json.loads((tmp_path / ".bloom" / "configurable_prompts" / "default.json").read_text())

    assert "rollout_system_prompt" not in prompts
    assert "scenario_context_prompt" not in prompts
    assert "target_response_format" not in prompts
    assert prompts["target_sysprompt_prefix"] == "Target system prompt."


def test_bloom_actually_loads_custom_prompts(tmp_path):
    """Bloom's load_configurable_prompts finds our custom prompts via _config_dir.

    This is the exact bug: we wrote the files but Bloom couldn't find them
    because _config_dir was relative. Bloom must load the prompts we wrote.
    """
    from bloom.utils import load_configurable_prompts
    from soulcraft.bloom import _bloom_config_dir, _prepare_bloom_env
    from soulcraft.config import ProjectConfig, RolloutConfig

    (tmp_path / "prompt.md").write_text("Target system prompt.")
    prompts_dir = tmp_path / "prompts"
    prompts_dir.mkdir()
    (prompts_dir / "evaluator.md").write_text("Custom evaluator prompt.")

    project = ProjectConfig(
        target_model="claude-sonnet-4-6",
        judge_model="claude-sonnet-4-6",
        evaluator_model="claude-opus-4-6",
        ideation_model="claude-sonnet-4-6",
        prompt=Path("prompt.md"),
        project_dir=tmp_path,
        rollout=RolloutConfig(evaluator_system_prompt="prompts/evaluator.md"),
    )
    behavior = BehaviorConfig(name="test", description="Test.")

    _prepare_bloom_env(project, behavior)

    # Simulate exactly what Bloom does: set _config_dir on the seed, then load prompts
    config_dir = _bloom_config_dir(tmp_path)
    seed = {"_config_dir": config_dir}
    prompts = load_configurable_prompts(seed)

    assert prompts["rollout_system_prompt"] == "Custom evaluator prompt."
    assert prompts["target_sysprompt_prefix"] == "Target system prompt."

    # When custom evaluator prompt is set, rollout_kickoff must be False
    # to suppress Bloom's default "You are now simulating the user..." boilerplate
    assert prompts["rollout_kickoff"] is False


def test_evaluator_prompts_fall_back_to_soulcraft_root(tmp_path):
    """When prompt files aren't in the project dir, they resolve from soulcraft's root."""
    from soulcraft.bloom import _resolve_prompt_file

    # prompts/evaluator.md doesn't exist in tmp_path, but does in soulcraft root
    soulcraft_root = Path(__file__).resolve().parent.parent
    result = _resolve_prompt_file("prompts/evaluator.md", tmp_path, soulcraft_root)

    assert result.exists()
    assert "soulcraft" in str(result)


def test_fixed_scenarios_prepended_to_ideation_json(tmp_path):
    """Fixed scenarios are prepended after ideation so rollout sees them first."""
    from soulcraft.bloom import _prepend_fixed_scenarios

    project = ProjectConfig(
        target_model="claude-sonnet-4-6",
        judge_model="claude-sonnet-4-6",
        evaluator_model="claude-opus-4-6",
        ideation_model="claude-sonnet-4-6",
        prompt=Path("prompt.md"),
        project_dir=tmp_path,
    )
    behavior = BehaviorConfig(
        name="test",
        description="Test behavior.",
        scenarios=["career-crisis", "supply-deadline"],
    )

    scenarios_dir = tmp_path / "scenarios"
    scenarios_dir.mkdir()
    (scenarios_dir / "career-crisis.yaml").write_text(
        yaml.dump({"description": "Senior designer passed over for promotion"})
    )
    (scenarios_dir / "supply-deadline.yaml").write_text(
        yaml.dump({"description": "Ceramics studio owner with a supply crisis"})
    )

    run_dir = tmp_path / ".bloom" / "test" / "2026-03-26"
    run_dir.mkdir(parents=True)
    (run_dir / "ideation.json").write_text(
        '{"variations": [{"description": "generated scenario 1"}, {"description": "generated scenario 2"}]}'
    )

    _prepend_fixed_scenarios(project, behavior, run_dir)

    import json

    ideation = json.loads((run_dir / "ideation.json").read_text())
    assert ideation["variations"][0]["label"] == "career-crisis"
    assert "passed over for promotion" in ideation["variations"][0]["description"]
    assert ideation["variations"][1]["label"] == "supply-deadline"
    assert ideation["variations"][2]["description"] == "generated scenario 1"
    assert ideation["variations"][3]["description"] == "generated scenario 2"
