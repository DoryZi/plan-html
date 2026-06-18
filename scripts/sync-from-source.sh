#!/usr/bin/env bash
#
# sync-from-source.sh — Pull the canonical skill files into this OSS repo.
#
# The source of truth for the SERVED artifacts is the skill at
# .claude/skills/plan-html/ in the main repo. This repo is the published copy:
# it owns lint, tests and CI. templates/deck.html is a single hand-edited
# offline file kept byte-identical between the skill and this repo.
#
# Sync copies serve_plan.py, SKILL.md and templates/deck.html from the skill
# (those are authored there). After syncing the deck, run `npm run lint` and
# `npm run test:e2e` to confirm the deck still passes.
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

copy "$SKILL_DIR/serve_plan.py"          "$REPO_DIR/serve_plan.py"
copy "$SKILL_DIR/SKILL.md"               "$REPO_DIR/SKILL.md"
copy "$SKILL_DIR/templates/deck.html"    "$REPO_DIR/templates/deck.html"

# Plugin-marketplace discovery: keep skills/plan-html/SKILL.md identical to root.
copy "$SKILL_DIR/SKILL.md"               "$REPO_DIR/skills/plan-html/SKILL.md"

echo
echo "Note: templates/deck.html is a single hand-edited offline file."
echo "Run 'npm run lint' and 'npm run test:e2e' to verify it."
