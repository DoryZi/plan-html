#!/usr/bin/env bash
#
# sync-from-source.sh — Pull the canonical skill files into this OSS repo.
#
# The source of truth for the SERVED artifacts is the skill at
# .claude/skills/plan-html/ in the main repo. This repo is the published copy:
# it owns the modular `src/`, build, lint, tests and CI, and the committed
# templates/deck.html is the build output of src/.
#
# Sync copies serve_plan.py and SKILL.md from the skill (those are authored
# there). It does NOT overwrite templates/deck.html from the skill blindly —
# run `npm run build` to regenerate it from src/, then verify it matches the
# skill's served deck with `npm run build:check` semantics.
#
# Usage:
#   ./scripts/sync-from-source.sh [--dry-run]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SOURCE_REPO="$(cd "$REPO_DIR/../.." && pwd)"
SKILL_DIR="$SOURCE_REPO/.claude/skills/plan-html"

DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

copy() {
    local src="$1" dst="$2"
    if [[ ! -f "$src" ]]; then echo "missing source: $src" >&2; exit 1; fi
    if $DRY_RUN; then echo "would copy: $src -> $dst"; else
        mkdir -p "$(dirname "$dst")"; cp "$src" "$dst"; echo "copied: $dst"
    fi
}

copy "$SKILL_DIR/serve_plan.py" "$REPO_DIR/serve_plan.py"
copy "$SKILL_DIR/SKILL.md"      "$REPO_DIR/SKILL.md"

echo
echo "Note: templates/deck.html is BUILT from src/ — run 'npm run build'."
echo "The skill's served deck.html should equal the build output."
