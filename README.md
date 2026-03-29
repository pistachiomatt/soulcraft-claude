# Soulcraft

An AI prompt engineer with judgment. You define the behaviors you want your AI to embody — warmth, directness, proactivity — and Soulcraft Claude does the heavy lifting: generating eval scenarios, running multi-turn conversations with a simulated human, and iterating agentically until the AI meets the vision. The human brings taste and intuition. The AI brings craft.

<div align="center">

[![Video Walkthrough](https://img.youtube.com/vi/Kk1dq2lQnCw/maxresdefault.jpg)](https://youtu.be/Kk1dq2lQnCw)

[Problem](https://youtu.be/Kk1dq2lQnCw?t=48) · [Why 2026](https://youtu.be/Kk1dq2lQnCw?t=85) · [Solution](https://youtu.be/Kk1dq2lQnCw?t=124) · [Principles](https://youtu.be/Kk1dq2lQnCw?t=208) · [Demo](https://youtu.be/Kk1dq2lQnCw?t=249)

</div>

## Easiest way to demo

Soulcraft is a CLI tool + augmented Claude Code that runs the CLI. Here's a zero-click way to demo!

> 👉 [Try the CLI and Claude in a remote VSCode](https://soulcraft-claude-demo.pistachio.life/), password provided in email
>
> 👉 [View eval results in a TUI](https://soulcraft-claude-tui-demo.pistachio.life)

## Or run it on your machine

```bash
# Clone soulcraft
git clone https://github.com/pistachiomatt/soulcraft-claude.git ~/Sites/soulcraft

# Install as a CLI tool
uv tool install ~/Sites/soulcraft

# Create a new project in your repo
cd ~/my-project/evals
soulcraft init

# Let Soulcraft Claude take it from here
soulcraft claude
```

## More info

Soulcraft uses the [Bloom](https://github.com/safety-research/bloom) engine, a eval framework for safety by Anthropic. Behaviour + Judging + eval loop = Bloom. Prompt + human-sim AI + agentic Claude = Soulcraft.

| Command | What it does |
|---------|-------------|
| `soulcraft init` | Scaffold `soulcraft.yaml`, `prompt.md`, `behaviors/` in the current directory |
| `soulcraft add <name>` | Create a new behavior YAML |
| `soulcraft understand <behavior>` | Research the behavior and generate a scoring rubric |
| `soulcraft test [behavior]` | Run the full eval pipeline (all behaviors if omitted) |
| `soulcraft results <behavior> [scenario]` | View results at three zoom levels |
| `soulcraft tui [behavior] [scenario]` | Live results viewer with deep linking |
| `soulcraft claude` | Launch the AI prompt artisan |

All commands accept `--project-dir <path>` to operate on a project from anywhere.

## The Full Guide

The complete prompt development guide — writing behaviors, the eval loop, reading transcripts, and lessons from the field — lives in [`soulcraft-claude/.claude/skills/soulcraft/SKILL.md`](soulcraft-claude/.claude/skills/soulcraft/SKILL.md).

This is the same guide Soulcraft Claude uses. Humans and AI read the same playbook.

## Developing in this repo

If you're developing Soulcraft or Bloom, install the dev wrapper so commands point to your local editable checkouts:

```bash
# BLOOM_ROOT=/path/to/pistachios-bloom if not a child folder of soulcraft
make install-dev-wrapper

cd ~/my-prompt-project
soulcraft-dev init
soulcraft-dev claude
```
