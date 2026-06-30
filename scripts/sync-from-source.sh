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
# SKILL.md note: the skill's copy hardcodes a machine-local `uv run --directory
# <abs path>` serve command. The published copy must instead use the portable
# `${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/skills/plan-html}` form so plugin and
# manual installs both work. After copying SKILL.md we rewrite that one command
# block back to the portable form (idempotent; errors loudly if the expected
# source block is missing, so silent drift can't slip through).
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

# portablize_run_command — rewrite the skill's machine-local serve command into
# the portable published form, in place. Idempotent: if the file already has the
# portable form (and not the hardcoded one) it's a no-op. Errors out if neither
# form is present, so the script can never silently publish a stale command.
portablize_run_command() {
    local file="$1"
    if [[ ! -f "$file" ]]; then echo "missing file: $file" >&2; exit 1; fi
    if $DRY_RUN; then echo "would portablize run command: $file"; return; fi
    python3 - "$file" <<'PY'
import sys

path = sys.argv[1]
text = open(path, encoding="utf-8").read()

hardcoded = (
    "   uv run --directory /home/dory/ai_will_replace_you/.claude/skills/plan-html \\\n"
    "     python serve_plan.py --plan <abs-path>/design/plans/<slug>/plan.json --live\n"
)
portable = (
    "   # ${CLAUDE_PLUGIN_ROOT} resolves to this skill's install dir (plugin install).\n"
    "   # If you cloned manually instead, use that path, e.g. ~/.claude/skills/plan-html\n"
    "   python3 \"${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/skills/plan-html}/serve_plan.py\" \\\n"
    "     --plan <abs-path>/design/plans/<slug>/plan.json --live\n"
)

if portable in text and hardcoded not in text:
    print(f"already portable: {path}")
    sys.exit(0)
if hardcoded not in text:
    sys.exit(
        f"error: expected serve-command block not found in {path}; "
        "the skill's SKILL.md may have changed — update sync-from-source.sh."
    )

open(path, "w", encoding="utf-8").write(text.replace(hardcoded, portable))
print(f"portablized run command: {path}")
PY
}

copy "$SKILL_DIR/serve_plan.py"          "$REPO_DIR/serve_plan.py"
copy "$SKILL_DIR/SKILL.md"               "$REPO_DIR/SKILL.md"
copy "$SKILL_DIR/templates/deck.html"    "$REPO_DIR/templates/deck.html"

# Plugin-marketplace discovery: keep skills/plan-html/SKILL.md identical to root.
copy "$SKILL_DIR/SKILL.md"               "$REPO_DIR/skills/plan-html/SKILL.md"

# The skill's SKILL.md hardcodes a machine-local serve command; the published
# copies must use the portable ${CLAUDE_PLUGIN_ROOT} form. Rewrite both copies.
portablize_run_command "$REPO_DIR/SKILL.md"
portablize_run_command "$REPO_DIR/skills/plan-html/SKILL.md"

echo
echo "Note: templates/deck.html is a single hand-edited offline file."
echo "Run 'npm run lint' and 'npm run test:e2e' to verify it."
