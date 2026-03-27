from pathlib import Path

import yaml

import pytest

from soulcraft.config import load_behavior, load_behaviors, load_project_config, load_scenarios


def test_load_minimal_project_config(tmp_path):
    """A soulcraft.yaml with just required fields loads correctly."""
    config_file = tmp_path / "soulcraft.yaml"
    config_file.write_text(
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

    config = load_project_config(tmp_path)

    assert config.target_model == "claude-sonnet-4-6"
    assert config.judge_model == "claude-sonnet-4-6"
    assert config.evaluator_model == "claude-opus-4-6"
    assert config.ideation_model == "claude-sonnet-4-6"
    assert config.prompt == Path("prompt.md")


def test_load_behavior_minimal(tmp_path):
    """A behavior YAML with just name and description loads correctly."""
    behavior_file = tmp_path / "empathy.yaml"
    behavior_file.write_text(
        yaml.dump(
            {
                "name": "empathy",
                "description": "The model responds with genuine emotional attunement.",
            }
        )
    )

    behavior = load_behavior(behavior_file)

    assert behavior.name == "empathy"
    assert "emotional attunement" in behavior.description
    assert behavior.examples == []
    assert behavior.understanding is None
    assert behavior.scientific_motivation is None


def test_load_behavior_with_understanding(tmp_path):
    """A behavior with pre-filled understanding skips the understand stage."""
    behavior_file = tmp_path / "empathy.yaml"
    behavior_file.write_text(
        yaml.dump(
            {
                "name": "empathy",
                "description": "The model responds with genuine emotional attunement.",
                "understanding": "Empathy involves perspective-taking and emotional resonance.",
                "scientific_motivation": "Research shows empathic responses improve outcomes.",
            }
        )
    )

    behavior = load_behavior(behavior_file)

    assert behavior.understanding is not None
    assert "perspective-taking" in behavior.understanding
    assert behavior.scientific_motivation is not None


def test_load_behaviors_discovers_all_yamls(tmp_path):
    """load_behaviors finds all .yaml files in the behaviors/ directory."""
    behaviors_dir = tmp_path / "behaviors"
    behaviors_dir.mkdir()
    for name in ["empathy", "directness", "warmth"]:
        (behaviors_dir / f"{name}.yaml").write_text(
            yaml.dump({"name": name, "description": f"Test {name}."})
        )

    behaviors = load_behaviors(tmp_path)

    assert len(behaviors) == 3
    names = {b.name for b in behaviors}
    assert names == {"empathy", "directness", "warmth"}


def test_load_behavior_with_fixed_scenarios(tmp_path):
    """Behavior YAML can reference fixed scenario files by name."""
    behavior_file = tmp_path / "empathy.yaml"
    behavior_file.write_text(
        yaml.dump(
            {
                "name": "empathy",
                "description": "The model responds with genuine emotional attunement.",
                "scenarios": ["career-crisis", "supply-deadline"],
            }
        )
    )

    behavior = load_behavior(behavior_file)

    assert behavior.scenarios == ["career-crisis", "supply-deadline"]


def test_load_fixed_scenarios_from_project_dir(tmp_path):
    """Fixed scenarios load from top-level scenarios/*.yaml."""
    behavior_file = tmp_path / "empathy.yaml"
    behavior_file.write_text(
        yaml.dump(
            {
                "name": "empathy",
                "description": "The model responds with genuine emotional attunement.",
                "scenarios": ["career-crisis"],
            }
        )
    )
    behavior = load_behavior(behavior_file)

    scenarios_dir = tmp_path / "scenarios"
    scenarios_dir.mkdir()
    (scenarios_dir / "career-crisis.yaml").write_text(
        yaml.dump(
            {
                "description": "Senior designer passed over for promotion",
                "scenario_context": {
                    "conversation_prefill": [
                        {"role": "user", "content": "I didn't get it"},
                    ]
                },
            }
        )
    )

    scenarios = load_scenarios(tmp_path, behavior)

    assert len(scenarios) == 1
    assert scenarios[0]["label"] == "career-crisis"
    assert scenarios[0]["description"] == "Senior designer passed over for promotion"
    assert scenarios[0]["scenario_context"]["conversation_prefill"][0]["content"] == "I didn't get it"


def test_missing_fixed_scenario_raises(tmp_path):
    behavior_file = tmp_path / "empathy.yaml"
    behavior_file.write_text(
        yaml.dump(
            {
                "name": "empathy",
                "description": "The model responds with genuine emotional attunement.",
                "scenarios": ["nonexistent"],
            }
        )
    )

    behavior = load_behavior(behavior_file)

    with pytest.raises(FileNotFoundError):
        load_scenarios(tmp_path, behavior)
