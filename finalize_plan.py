"""Write the final plan: plan.md for builders, and plan.json next to it, the same plan as data.

    uv run --directory <this skill> python finalize_plan.py --plan <live plan.json> --round <file> [--out <plan.md>]
    uv run --directory <this skill> python finalize_plan.py --plan <a final plan.json> [--out <plan.md>]

`--round` is a file holding the deck's finalize JSON (the last `{"action": "finalize", ...}` line is used,
so the server's output file works as is). Each card gets its final answer: the user's pick, typed answer, in-place
edit, grill answers and Q&A thread; the notes left on the design prototype and the walk-through reviews go in
too. Without `--round` the plan must already be final (an older cycle's plan.json): it is only written out.

plan.md holds everything the deck held, tight: goal, intents with their checks, boundaries, decisions (the pick,
why, the options, the discussion), what exploring found, steps, walk-throughs, design notes, the final checks
table (the verify tool reads it). Builders execute plan.md; plan.json (the deck's plan with every answer folded
in) is the reference it points to when something is unclear.
Without `--out`: a live deck in a cycle's `.work/` folder (`cycles/YYYY-MM-DD-NN-<slug>/.work/plan.json`) gets
the cycle's `plan.md` and `plan.json`, and its `files/` folder (card images and the design prototype) is copied into the cycle,
so the prototype stays as the record of the agreed design (the next cycle starts from it). Anywhere else the
plan is written next to the given one as `YYYY-MM-DD-<slug>-plan.md` and `-plan.json`. Without `--round` only
plan.md is written (the given plan.json is already the final one). The live plan.json and the answers and
questions files next to it are working files, never committed.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from datetime import date
from pathlib import Path

SECTIONS = ("intents", "boundaries", "discovered", "decisions", "steps")
KIND_SECTION = {"intent": "intents", "boundary": "boundaries", "discovered": "discovered",
                "decision": "decisions", "step": "steps"}
FINAL_KEYS = ("choice", "answer", "edit", "grill", "thread", "priority")


def last_finalize(text: str) -> dict:
    """The last finalize round in a file of JSON lines (a server output file, or one JSON object)."""
    rounds = []
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("{"):
            try:
                event = json.loads(line)
            except ValueError:
                continue
            if isinstance(event, dict) and event.get("action") == "finalize":
                rounds.append(event)
    if not rounds:
        raise SystemExit("Error: no finalize round found (the deck must be finalized first)")
    return rounds[-1]


def _final_of(card: dict) -> dict:
    return {k: card[k] for k in FINAL_KEYS if card.get(k) not in (None, "", [], {})}


def fold(plan: dict, rnd: dict) -> dict:
    """Return a copy of the plan with the round folded in. A card the round leaves out was struck: it is dropped."""
    final = json.loads(json.dumps(plan))
    if "cards" in rnd:
        kept = {card.get("id") for card in rnd["cards"]}
        for section in SECTIONS:
            if isinstance(final.get(section), list):
                final[section] = [c for c in final[section] if not isinstance(c, dict) or c.get("id") in kept]
    by_id = {item.get("id"): item for section in SECTIONS for item in final.get(section, []) if isinstance(item, dict)}
    for card in rnd.get("cards", []):
        cid = card.get("id")
        if card.get("userAdded"):
            draft = dict(card.get("draft") or {}, id=cid, userAdded=True, final=_final_of(card))
            final.setdefault(KIND_SECTION.get(card.get("kind"), "decisions"), []).append(draft)
        elif cid in by_id:
            by_id[cid]["final"] = _final_of(card)
            if card.get("edit"):
                by_id[cid]["finalEdit"] = card["edit"]
    if rnd.get("finalVerify"):
        final["finalVerify"] = rnd["finalVerify"]
    notes = [*(rnd.get("designNotesEarlier") or []), *(rnd.get("designNotes") or [])]
    if notes:
        final["designNotes"] = notes
    if rnd.get("designReviews"):
        final["designReviews"] = rnd["designReviews"]
    note = (rnd.get("agentActions") or {}).get("note")
    if note:
        final["finalNote"] = note
    final["finalized"] = date.today().isoformat()
    final["finalRound"] = rnd.get("round", final.get("round"))
    return final


DATED = re.compile(r"^(\d{4}-\d{2}-\d{2})-(.+)$")


def default_out(plan_path: Path, plan: dict) -> Path:
    """The cycle's plan.md for a deck in a cycle's .work/ (or a cycle's own plan.json); else a dated plan.md next to it."""
    if plan_path.parent.name == ".work":
        return plan_path.parent.parent / "plan.md"
    if plan_path.parent.parent.name == "cycles":
        return plan_path.with_name("plan.md")
    folder = DATED.match(plan_path.parent.name)
    day = folder.group(1) if folder else date.today().isoformat()
    slug = plan.get("slug") or (folder.group(2) if folder else plan_path.parent.name)
    return plan_path.with_name(f"{day}-{slug}-plan.md")


def _screens_dir(final: dict) -> str:
    """The folder of the design's mock screens (`files/mocks`), from the first step that names one; "" when none."""
    design = final.get("design") or {}
    flows = [o for d in final.get("decisions", []) if isinstance(d, dict) and d.get("variant")
             for o in d.get("options", []) if isinstance(o, dict)] + list(design.get("journeys") or [])
    for flow in flows:
        for st in flow.get("steps") or []:
            if isinstance(st, dict) and st.get("screen"):
                path = "files/" + str(st["screen"]).lstrip("/").removeprefix("files/")
                return path.rsplit("/", 1)[0]
    return ""


def _flat(text: object) -> str:
    """One line of text: newlines become spaces, so a card stays one list item."""
    return " ".join(str(text or "").split())


def _cell(text: object) -> str:
    """Text for a table cell: one line, pipes escaped."""
    return _flat(text).replace("|", "\\|")


def _said(final: dict) -> str:
    """What the user answered on a card, in one line ("" when they only approved)."""
    parts = []
    choice = final.get("choice")
    if choice == "reject":
        parts.append("not as written")
    elif choice and choice not in ("approve", "agree"):
        parts.append(f"picked {_flat(choice)}")
    if final.get("answer"):
        parts.append(f'"{_flat(final["answer"])}"')
    if final.get("edit"):
        parts.append(f'rewrote it: "{_flat(final["edit"])}"')
    parts += [f'asked "{_flat(g.get("q"))}": "{_flat(g.get("answer"))}"' for g in final.get("grill") or [] if g.get("answer")]
    return "; ".join(parts)


def _thread(thread: list | None) -> str:
    """A card's Q&A as one line: User: "..." / Agent: "..."."""
    said = [f'{"User" if t.get("role") == "user" else "Agent"}: "{_flat(t.get("text"))}"' for t in thread or [] if t.get("text")]
    return " / ".join(said)


def _where(note: dict) -> str:
    """Where a design note sits: the screen and route, the spot when pinned, the device and the fork options shown."""
    where = f"{note.get('title') or note.get('route', '')} ({note.get('route', '')})"
    if note.get("element"):
        where += f", on the {note['element']}"
    elif note.get("x") is not None:
        where += f", at {round(note['x'] * 100)}% across, {round(note['y'] * 100)}% down"
    shown = ", ".join(f"{k}:{v}" for k, v in sorted((note.get("variants") or {}).items()))
    return where + f", {note.get('device', 'desktop')}" + (f", showing {shown}" if shown else "")


def _text(card: dict, *keys: str) -> str:
    """A card's own text: the user's rewrite when they made one, else the first of keys it has."""
    if card.get("finalEdit"):
        return _flat(card["finalEdit"])
    return next((_flat(card[k]) for k in (*keys, "text", "body", "summary") if card.get(k)), "")


def _answers(card: dict) -> list[str]:
    """The lines under a card: the user's answer and the Q&A, when there are any."""
    final = card.get("final") or {}
    lines = [f"   User: {said}" for said in [_said(final)] if said]
    talk = _thread(final.get("thread") or card.get("thread"))
    return lines + ([f"   Discussion: {talk}"] if talk else [])


def plan_md(final: dict) -> str:
    """The final plan as one markdown file: everything the deck held, tight, for a builder to execute."""
    design = final.get("design") or {}
    lines = [f"# Plan: {final.get('title', 'plan')}", "",
             f"Finalized {final.get('finalized')}, round {final.get('finalRound')}. This file is the plan: build from it. "
             "The cycle's intent.md (and spec.md) say why. The user's words are quoted exactly. The same plan as data is "
             f"{final.get('_json_ref', '`plan.json` next to this file')}: if anything here is unclear, check it there.", ""]
    if final.get("goal"):
        lines += [f"**Goal:** {_flat(final['goal'])}", ""]
    if final.get("task"):
        lines += [f"**Task:** {_flat(final['task'])}", ""]
    if design.get("prototype"):
        size = f", {design['width']}x{design['height']}" if design.get("width") else ""
        entry = "files/" + str(design["prototype"]).lstrip("/").removeprefix("files/")
        lines += [f"**Prototype:** `{entry}` (start at `{design.get('start', '#/')}`{size}): the agreed "
                  "design, the target the build matches; `files/shots/` has a screenshot of every walk-through step.", ""]
    elif (screens := _screens_dir(final)):
        lines += [f"**Screens:** `{screens}`: the agreed mock screens (one file per step), the target the build matches; "
                  "`files/shots/` has a screenshot of every step. A picked screen is settled: everything on it gets built.", ""]
    intents = [c for c in final.get("intents", []) if isinstance(c, dict)]
    if intents:
        lines += ["## Intents", ""]
        for n, c in enumerate(intents, 1):
            tags = ", ".join(t for t in (f"`{c.get('id')}`", f"walk-through `{c['journey']}`" if c.get("journey") else "") if t)
            lines.append(f"{n}. **{_flat(c.get('title'))}** ({tags}): {_text(c, 'intent')}")
            v = c.get("verify") or {}
            if isinstance(v, dict) and (v.get("command") or v.get("expected")):
                lines.append(f"   Check: {_flat(v.get('method'))}, `{_flat(v.get('command'))}`; expected: {_flat(v.get('expected'))}")
            elif v:
                lines.append(f"   Check: {_flat(v)}")
            lines += _answers(c)
        lines.append("")
    boundaries = [c for c in final.get("boundaries", []) if isinstance(c, dict)]
    if boundaries:
        lines += ["## Boundaries", ""]
        for c in boundaries:
            lines.append(f"- **{_flat(c.get('title'))}**: {_text(c, 'boundary')}")
            lines += [ln.replace("   ", "  ", 1) for ln in _answers(c)]
        lines.append("")
    decisions = [c for c in final.get("decisions", []) if isinstance(c, dict)]
    if decisions:
        lines += ["## Decisions", ""]
        for c in decisions:
            pick = (c.get("final") or {}).get("choice")
            lines += [f"### {_flat(c.get('title'))} (`{c.get('id')}`)", ""]
            if pick and pick not in ("approve", "agree"):
                lines.append(f"**Picked: {_flat(pick)}.**")
            lines += [t for t in (_flat(c.get("summary")), _flat(c.get("building"))) if t]
            lines += [f"- {_flat(t)}" for t in c.get("tradeoffs") or []]
            if c.get("options"):
                lines.append("- Options: " + "; ".join(_flat(o.get("label") if isinstance(o, dict) else o) for o in c["options"]))
            final_c = dict(c.get("final") or {}, choice=None)
            said = _said(final_c)
            talk = _thread((c.get("final") or {}).get("thread") or c.get("thread"))
            lines += [f"- User: {said}"] if said else []
            lines += [f"- Discussion: {talk}"] if talk else []
            lines.append("")
    found = [c for c in final.get("discovered", []) if isinstance(c, dict)]
    if found:
        lines += ["## Found while exploring", ""]
        for c in found:
            extra = " ".join(t for t in (_flat(c.get("impact")), f"({_flat(c['source'])})" if c.get("source") else "") if t)
            lines.append(f"- **{_flat(c.get('title'))}**: {_text(c, 'finding')}" + (f" {extra}" if extra else ""))
            lines += [ln.replace("   ", "  ", 1) for ln in _answers(c)]
        lines.append("")
    steps = [c for c in final.get("steps", []) if isinstance(c, dict)]
    if steps:
        lines += ["## Steps", ""]
        for n, c in enumerate(steps, 1):
            more = " ".join(f"{label}: {_flat(c[k])}." for k, label in (("files", "Files"), ("test", "Test")) if c.get(k))
            tag = f" (for `{c['intent']}`)" if c.get("intent") else ""
            lines.append(f"{n}. **{_flat(c.get('title'))}**{tag}: {_text(c, 'description')}" + (f" {more}" if more else ""))
            lines += _answers(c)
        lines.append("")
    reviews = {r.get("journey"): r.get("review") for r in final.get("designReviews") or []}
    journeys = [j for j in design.get("journeys") or [] if isinstance(j, dict)]
    if journeys:
        lines += ["## Walk-throughs", "", "Each is a golden path to click through in the built app, at 1280 and 390 wide.", ""]
        for j in journeys:
            seen = {"ok": " User: looks right.", "skip": " User: not now."}.get(reviews.get(j.get("id")), "")
            lines += [f"### `{j.get('id')}`: {_flat(j.get('title'))}", "", f"{_flat(j.get('summary'))}{seen}".strip(), ""]
            for n, st in enumerate(j.get("steps") or [], 1):
                then = f"; then {_flat(st['do'])}" if st.get("do") else ""
                lines.append(f"{n}. {_flat(st.get('title'))}: `{st.get('route', '')}`{then}")
            lines.append("")
    if final.get("designNotes"):
        replies = design.get("replies") or {}
        lines += ["## Notes on the design", "", "The user's notes on the prototype; each is applied in it.", ""]
        for note in final["designNotes"]:
            reply = replies.get(note.get("id"))
            lines.append(f'- Round {note.get("round", final.get("finalRound"))}, {_where(note)}: "{_flat(note.get("text"))}"'
                         + (f" Agent: {_flat(reply)}" if reply else ""))
        lines.append("")
    checks = final.get("finalVerify") or [dict(c["verify"], intent=c.get("id")) for c in intents if isinstance(c.get("verify"), dict)]
    if checks:
        lines += ["## Final checks", "", "| Expected | Intent | Method | Command |", "|---|---|---|---|"]
        lines += [f"| {_cell(r.get('expected'))} | {_cell(r.get('intent'))} | {_cell(r.get('method'))} | {_cell(r.get('command'))} |"
                  for r in checks if isinstance(r, dict)]
        talk = _thread(final.get("finalVerifyChat"))
        lines += ["", f"Discussion: {talk}"] if talk else []
        lines.append("")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    """Read the plan (and the finalize round), write plan.md, print its path."""
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--plan", required=True, type=Path)
    parser.add_argument("--round", type=Path, help="file with the finalize JSON line (leave off for a final plan.json)")
    parser.add_argument("--out", type=Path)
    args = parser.parse_args(argv)
    for given in (args.plan, args.round, args.out):
        if given is not None and not given.is_absolute():  # `uv run --directory` runs this from the skill folder
            raise SystemExit(f"Error: paths must be absolute (got {given})")
    plan = json.loads(args.plan.read_text(encoding="utf-8"))
    if args.round:
        final = fold(plan, last_finalize(args.round.read_text(encoding="utf-8")))
    elif plan.get("finalized"):
        final = plan
    else:
        raise SystemExit("Error: this plan is not final yet: give --round (the deck's finalize output)")
    out = args.out or default_out(args.plan, plan)
    out.parent.mkdir(parents=True, exist_ok=True)
    data = out.with_suffix(".json") if args.round else args.plan  # a final plan.json given as is stays where it is
    if args.round:
        data.write_text(json.dumps(final, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print(data)
    ref = f"`{data.name}` next to this file" if data.parent == out.parent else f"`{data}`"
    out.write_text(plan_md(dict(final, _json_ref=ref)), encoding="utf-8")
    print(out)
    files = args.plan.parent / "files"
    if out == args.plan.parent.parent / "plan.md" and files.is_dir():  # a cycle's plan: its files/ paths must work
        shutil.copytree(files, out.with_name("files"), dirs_exist_ok=True)
        print(out.with_name("files"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
