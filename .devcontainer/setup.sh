#!/bin/bash
set -e

# Install uv
curl -LsSf https://astral.sh/uv/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"

# Install soulcraft + bloom
cd /workspaces/soulcraft-claude
uv sync

# Install TUI deps
cd tui && npm install && cd ..

# Make soulcraft available globally
uv tool install /workspaces/soulcraft-claude

# Install Claude Code CLI
npm install -g @anthropic-ai/claude-code

# Set SOULCRAFT_ROOT so `soulcraft claude` finds soulcraft-claude/ when installed as a tool
echo 'export SOULCRAFT_ROOT=/workspaces/soulcraft-claude' >> ~/.bashrc

# Write .env for evals if API key is set
if [ -n "$ANTHROPIC_API_KEY" ]; then
  echo "ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY" > evals/test-ai/.env
fi

# Keep-alive: prevent Codespace idle timeout by producing periodic output
nohup bash -c 'while true; do sleep 300; echo -ne "\033[0K"; done' > /dev/null 2>&1 &

echo ""
echo "✓ Soulcraft ready. Run: soulcraft claude --project-dir /workspaces/soulcraft-claude/evals/test-ai"
