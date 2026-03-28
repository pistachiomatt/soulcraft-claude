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

# Write .env for evals if API key is set
if [ -n "$ANTHROPIC_API_KEY" ]; then
  echo "ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY" > evals/test-ai/.env
fi

echo ""
echo "✓ Soulcraft ready. Run: soulcraft claude --project-dir /workspaces/soulcraft-claude/evals/test-ai"
