#!/bin/bash
FILE_PATH=$(cat | jq -r '.tool_input.file_path // empty')

[[ "$FILE_PATH" =~ \.py$ ]] || exit 0

cd "$(dirname "$0")/../.." || exit 0
uv run ruff check "$FILE_PATH" 2>&1
exit 0
