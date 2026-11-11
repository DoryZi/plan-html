#!/usr/bin/env bash
#
# sync-from-source.sh: pull the canonical skill files into this OSS repo.
#
# The source of truth is the skill at .claude/skills/plan-html/ in the main
# repo. This repo is the published copy: it owns lint, the HTTP and JS tests
# and CI. templates/deck.html is a single hand-edited offline file kept
# byte-identical between the skill and this repo.
#
# Sync copies the scripts, SKILL.md, the templates, the examples and the
# skill's own tests, then makes the copy portable (the source repo's
# publish/portablize.py, which is not published):
# machine-local `uv run --directory <abs path>` commands become the
# `${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/skills/plan-html}` form, so plugin and
# manual installs both work, and notes that only make sense in the source repo
# are dropped, and the examples show a made-up app and user instead of the
# source repo's own (their screenshots are retaken, which needs uv and
# Playwright's Chromium). It fails loudly if anything machine-local or personal
# is left.
#
# After syncing run `npm test` and `pytest`.
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

for f in serve_plan.py finalize_plan.py cycles.py check_prototype.py SKILL.md \
         templates/deck.html templates/proto-kit.js \
         tests/test_deck.py tests/test_check_mocks.py tests/test_finalize.py; do
    copy "$SKILL_DIR/$f" "$REPO_DIR/$f"
done

# Plugin-marketplace discovery reads skills/plan-html/SKILL.md.
copy "$SKILL_DIR/SKILL.md" "$REPO_DIR/skills/plan-html/SKILL.md"

# The worked examples (the deck's tests serve them).
if [[ ! -d "$SKILL_DIR/examples" ]]; then echo "missing source: $SKILL_DIR/examples" >&2; exit 1; fi
if $DRY_RUN; then echo "would copy: $SKILL_DIR/examples -> $REPO_DIR/examples"; else
    rm -rf "$REPO_DIR/examples"
    cp -r "$SKILL_DIR/examples" "$REPO_DIR/examples"
    # The source's screenshots show the source's own app: they are retaken below from the published screens.
    rm -rf "$REPO_DIR"/examples/*/files/shots
    echo "copied: $REPO_DIR/examples (without screenshots)"
fi

if $DRY_RUN; then echo "would portablize the copy and retake the example screenshots"; else
    python3 "$SKILL_DIR/publish/portablize.py" "$REPO_DIR"
    for plan in "$REPO_DIR"/examples/*/plan.json; do
        (cd "$REPO_DIR" && uv run --extra test python check_prototype.py --plan "$plan" --shots-only)
    done
fi

echo
echo "Run 'npm test' and 'pytest' to verify the copy."
