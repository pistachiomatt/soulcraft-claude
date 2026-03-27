from dataclasses import dataclass, field, fields
from pathlib import Path
from typing import Any

import yaml


@dataclass
class IdeationConfig:
    total_evals: int = 10
    diversity: float = 0.8


@dataclass
class RolloutConfig:
    max_turns: int = 5
    max_concurrent: int = 5
    use_fixed_target_prompt: bool = True
    target_reasoning_effort: str = "medium"
    evaluator_reasoning_effort: str = "medium"
    evaluator_system_prompt: str | None = None
    scenario_context_template: str | None = None
    target_response_format: str | None = None


@dataclass
class JudgmentConfig:
    max_concurrent: int = 10
    additional_qualities: list[str] = field(default_factory=list)


@dataclass
class BehaviorConfig:
    name: str
    description: str
    examples: list[str] = field(default_factory=list)
    scenarios: list[str] = field(default_factory=list)
    understanding: str | None = None
    scientific_motivation: str | None = None
    repetitions: int = 1
    target_reasoning_effort: str | None = None
    tools: list = field(default_factory=list)
    file_path: Path | None = None


@dataclass
class ProjectConfig:
    target_model: str
    judge_model: str
    evaluator_model: str
    ideation_model: str
    prompt: Path
    provider: str = "anthropic"
    base_url: str | None = None
    tool_simulation_model: str | None = None
    ideation: IdeationConfig = field(default_factory=IdeationConfig)
    rollout: RolloutConfig = field(default_factory=RolloutConfig)
    judgment: JudgmentConfig = field(default_factory=JudgmentConfig)
    project_dir: Path = field(default_factory=lambda: Path("."))


def _pick_fields(cls, raw: dict) -> dict:
    """Filter a dict to only keys that match dataclass fields."""
    valid = {f.name for f in fields(cls)}
    return {k: v for k, v in raw.items() if k in valid}


def load_project_config(project_dir: Path) -> ProjectConfig:
    config_path = project_dir / "soulcraft.yaml"
    raw = yaml.safe_load(config_path.read_text())

    ideation = IdeationConfig(**_pick_fields(IdeationConfig, raw["ideation"])) if "ideation" in raw else IdeationConfig()
    rollout = RolloutConfig(**_pick_fields(RolloutConfig, raw["rollout"])) if "rollout" in raw else RolloutConfig()
    judgment = JudgmentConfig(**_pick_fields(JudgmentConfig, raw["judgment"])) if "judgment" in raw else JudgmentConfig()

    return ProjectConfig(
        target_model=raw["target_model"],
        judge_model=raw["judge_model"],
        evaluator_model=raw["evaluator_model"],
        ideation_model=raw["ideation_model"],
        prompt=Path(raw["prompt"]),
        provider=raw.get("provider", "anthropic"),
        base_url=raw.get("base_url"),
        tool_simulation_model=raw.get("tool_simulation_model"),
        ideation=ideation,
        rollout=rollout,
        judgment=judgment,
        project_dir=project_dir,
    )


def load_behavior(path: Path) -> BehaviorConfig:
    raw = yaml.safe_load(path.read_text())

    return BehaviorConfig(
        name=raw["name"],
        description=raw["description"],
        examples=raw.get("examples") or [],
        scenarios=raw.get("scenarios") or [],
        understanding=raw.get("understanding"),
        scientific_motivation=raw.get("scientific_motivation"),
        repetitions=raw.get("repetitions", 1),
        target_reasoning_effort=raw.get("target_reasoning_effort"),
        tools=raw.get("tools") or [],
        file_path=path,
    )


def load_behaviors(project_dir: Path) -> list[BehaviorConfig]:
    behaviors_dir = project_dir / "behaviors"
    if not behaviors_dir.exists():
        return []
    return sorted(
        [load_behavior(p) for p in behaviors_dir.glob("*.yaml")],
        key=lambda b: b.name,
    )


def load_scenarios(project_dir: Path, behavior: BehaviorConfig) -> list[dict[str, Any]]:
    """Load fixed scenarios referenced by a behavior from project_dir/scenarios/*.yaml."""
    if not behavior.scenarios:
        return []

    scenarios_dir = project_dir / "scenarios"
    loaded: list[dict[str, Any]] = []

    for name in behavior.scenarios:
        path = scenarios_dir / f"{name}.yaml"
        if not path.exists():
            raise FileNotFoundError(
                f"Scenario '{name}' not found at {path}. Create it in scenarios/."
            )

        raw = yaml.safe_load(path.read_text()) or {}
        variation: dict[str, Any] = {
            "description": raw.get("description", ""),
            "label": name,
        }
        if raw.get("scenario_context"):
            variation["scenario_context"] = raw["scenario_context"]
        if raw.get("tools"):
            variation["tools"] = raw["tools"]
        loaded.append(variation)

    return loaded
