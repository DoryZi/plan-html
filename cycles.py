"""Cycle folders: one folder per step of a project, in order, like a chain of migrations.

    uv run --directory <this skill> python cycles.py new --root <repo> --slug fix-route     # prints the new folder
    uv run --directory <this skill> python cycles.py current --root <repo>                  # prints the newest one
    uv run --directory <this skill> python cycles.py context --root <repo>                  # what past cycles left

Format: `<repo>/cycles/YYYY-MM-DD-NN-<slug>/`, NN counting the cycles started that day
(01, 02, ...), so the folder list reads as the project's history. Inside: intent.md, spec.md, plan.md (the
final plan, for builders) and plan.json (the same plan as data; cycles before Oct 31 have decisions.md instead
of plan.md), discussions/, verify/, and `.work/` for files that are never committed (the live
deck, run logs, screenshots). `new` makes `.work/` and adds `cycles/*/.work/` to the repo's .gitignore.
fix-heal-loop names its cycles the same way (agent_tools/fix_heal_loop/lib/paths.py).

`context` is the design input for the next cycle: every cycle oldest first (its intent's first lines, the final
plan's goal, where its decisions and its prototype are), the newest prototype to start from, and the project's
other design folders (intent/, spec/, plan/, design/plans/, mocks/) for projects that keep docs outside cycles.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import date
from pathlib import Path

NAME = re.compile(r"^(\d{4}-\d{2}-\d{2})-(\d{2})-([a-z0-9][a-z0-9-]*)$")
IGNORE_LINE = "cycles/*/.work/"


def slugify(text: str) -> str:
    """Lower-case words joined by "-"."""
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    if not slug:
        raise SystemExit("Error: the slug needs letters or digits")
    return slug[:60]


def folders(root: Path) -> list[Path]:
    """Cycle folders under root, oldest first."""
    base = root / "cycles"
    return sorted(p for p in base.iterdir() if p.is_dir() and NAME.match(p.name)) if base.is_dir() else []


def next_name(root: Path, slug: str, day: str | None = None) -> str:
    """The next folder name for today: YYYY-MM-DD-NN-<slug>."""
    day = day or date.today().isoformat()
    taken = [int(m.group(2)) for p in folders(root) if (m := NAME.match(p.name)) and m.group(1) == day]
    return f"{day}-{max(taken, default=0) + 1:02d}-{slugify(slug)}"


def ensure_ignored(root: Path) -> None:
    """Add cycles/*/.work/ to the repo's .gitignore when missing."""
    file = root / ".gitignore"
    text = file.read_text(encoding="utf-8") if file.exists() else ""
    if IGNORE_LINE not in text.splitlines():
        file.write_text(text.rstrip("\n") + ("\n" if text else "")
                        + f"# cycle working files (live decks, run logs, screenshots)\n{IGNORE_LINE}\n",
                        encoding="utf-8")


def new(root: Path, slug: str) -> Path:
    """Make the next cycle folder (and its .work/) and return it."""
    folder = root / "cycles" / next_name(root, slug)
    (folder / ".work").mkdir(parents=True, exist_ok=False)
    ensure_ignored(root)
    return folder


DESIGN_FOLDERS = ("intent", "spec", "plan", "design/plans", "mocks")


def _intent_lines(folder: Path, n: int = 4) -> list[str]:
    """The first few non-empty lines of a cycle's intent.md (headings and quote marks dropped)."""
    file = folder / "intent.md"
    if not file.is_file():
        return []
    lines = [ln.strip().lstrip("#> ").strip() for ln in file.read_text(encoding="utf-8").splitlines()]
    return [ln if len(ln) <= 240 else ln[:237] + "..." for ln in lines if ln][:n]


PLAN_LINES = {"Goal": re.compile(r"^\*\*Goal:\*\* (.*\S)"), "Prototype": re.compile(r"^\*\*Prototype:\*\* `([^`]+)`"),
              "Screens": re.compile(r"^\*\*Screens:\*\* `([^`]+)`")}


def _plan_md(folder: Path, field: str) -> str | None:
    """A field of the cycle's plan.md (`**Goal:** ...`, `**Prototype:** `files/...``), or None."""
    plan = folder / "plan.md"
    if not plan.is_file():
        return None
    for line in plan.read_text(encoding="utf-8").splitlines():
        if found := PLAN_LINES[field].match(line):
            return found.group(1).strip()
    return None


def _prototype(folder: Path) -> Path | None:
    """The cycle's kept design: plan.md's Screens line (the mock screens folder) or its Prototype line (or an older
    plan.json's design.prototype) under files/, else files/proto/index.html."""
    screens = _plan_md(folder, "Screens")
    if screens and (folder / str(screens).lstrip("/")).is_dir():
        return folder / str(screens).lstrip("/")
    entry = _plan_md(folder, "Prototype") or "proto/index.html"
    plan = folder / "plan.json"
    if plan.is_file() and not (folder / "plan.md").is_file():
        try:
            entry = (json.loads(plan.read_text(encoding="utf-8")).get("design") or {}).get("prototype") or entry
        except ValueError:
            pass
    found = folder / "files" / str(entry).lstrip("/").removeprefix("files/")
    return found if found.is_file() else None


def context(root: Path) -> str:
    """A short markdown digest of what earlier cycles decided and built, oldest first."""
    out = ["# Design context from earlier cycles", ""]
    latest = None
    found = folders(root)
    for folder in found:
        out.append(f"## {folder.name}")
        out += [f"- intent: {ln}" for ln in _intent_lines(folder)]
        goal = _plan_md(folder, "Goal")
        plan = folder / "plan.json"
        if goal is None and plan.is_file():  # an older cycle, before plan.md
            try:
                goal = json.loads(plan.read_text(encoding="utf-8")).get("goal")
            except ValueError:
                goal = None
        if goal:
            out.append(f"- goal: {goal}")
        for name in ("plan.md", "decisions.md", "spec.md"):
            if (folder / name).is_file():
                out.append(f"- {name}: {folder / name}")
        proto = _prototype(folder)
        if proto:
            latest = proto
            out.append(f"- {'screens' if proto.is_dir() else 'prototype'}: {proto}")
        out.append("")
    if not found:
        out += ["No cycle folders yet.", ""]
    newest = (latest if latest.is_dir() else latest.parent) if latest else None
    out.append(f"Newest design to start from: {newest or 'none (start from the real app)'}")
    others = [str(root / d) for d in DESIGN_FOLDERS if (root / d).is_dir()]
    if others:
        out += ["", "Other design folders in this project (read them too): " + ", ".join(others)]
    return "\n".join(out) + "\n"


def main(argv: list[str] | None = None) -> int:
    """new: make the next cycle folder; current: print the newest one; context: what earlier cycles left."""
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("new")
    p.add_argument("--root", type=Path, required=True)
    p.add_argument("--slug", required=True)
    p = sub.add_parser("current")
    p.add_argument("--root", type=Path, required=True)
    p = sub.add_parser("context")
    p.add_argument("--root", type=Path, required=True)
    args = parser.parse_args(argv)
    if not args.root.is_absolute():  # `uv run --directory` runs this from the skill folder, so "." is not the repo
        raise SystemExit(f"Error: --root must be an absolute path (got {args.root})")
    root = args.root.resolve()
    if args.command == "new":
        print(new(root, args.slug))
        return 0
    if args.command == "context":
        print(context(root), end="")
        return 0
    found = folders(root)
    if not found:
        print(f"Error: no cycle folders under {root / 'cycles'}", file=sys.stderr)
        return 1
    print(found[-1])
    return 0


if __name__ == "__main__":
    sys.exit(main())
