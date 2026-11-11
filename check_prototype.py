# /// script
# requires-python = ">=3.10"
# dependencies = ["playwright"]
# ///
"""Check a plan-html design: mock screens (the default), or a clickable prototype.

    uv run --directory <this skill> --with playwright python check_prototype.py --plan <abs path>/plan.json [--phone]

Mocks (no `design.prototype`; every step names a `screen` file under the plan's `files/`): opens each screen, fails a
page error, a link that goes anywhere (a mock's links are inert: `href="#"` or none), a step (not the last) whose
`click` is missing or not on its screen, a screen whose proto-kit.js is too old to ring that click and, with
`--phone`, a screen that scrolls sideways at 390 wide, and saves the step screenshots the deck shows, each step's
click ringed. Prints `MOCKS OK`.

Prototype (`design.prototype`), the opt-in click check:
Reads `design` from the plan (the prototype's entry file, its start route, the journeys) and the forks (decisions
with `variant`), serves the plan's `files/` folder on 127.0.0.1, and checks every route it can reach (the journey
steps, then every `#/` link found on the pages) under the first option of every fork, and each other option where
it shows (the fork's route, the journeys that pick it, one link further). On each route it clicks every visible
control once (a control already clicked on another route is skipped; a link to another screen passes when that
screen opens), reloading after any click that changed something. A click passes when the route or the
page changed, or when the prototype answered that it is outside this design (counted as a stub). It fails when
nothing happened (a dead click), when something only looks clickable (a pointer cursor, no control) and does
nothing, or when a link leaves the prototype; a page error fails the route. With `--phone` it also
opens every route at 390x844 and fails one that scrolls sideways.

It also saves a screenshot of every step of every option (and of every tour in `design.journeys`) into the plan's
`files/shots/` (`<fork>-<key>-<n>.jpg`, `tour-<id>-<n>.jpg`): the deck shows them so the user compares the options at
a glance. `--no-shots` skips them.

Exit 0 when nothing failed. The agent runs it before every round it serves; stubs are listed so the user can see
how much of the prototype is real.
"""

from __future__ import annotations

import argparse
import functools
import json
import logging
import re
import socket
import sys
import threading
import urllib.parse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

logging.basicConfig(stream=sys.stderr, level=logging.INFO, format="[check-prototype] %(message)s")
log = logging.getLogger("check-prototype")

CONTROLS = ("a[href], button, [role=button], [data-action], select, summary, "
            "input[type=checkbox], input[type=radio]")
TAG_JS = """(sel) => {
  const seen = new Set(), out = [];
  document.querySelectorAll('[data-chk]').forEach((e) => e.removeAttribute('data-chk'));
  for (const e of document.querySelectorAll(sel)) {
    if (seen.has(e) || e.tagName === 'FORM' || e.closest('[hidden]') || e.disabled) continue;
    const r = e.getBoundingClientRect();
    const st = getComputedStyle(e);
    if (!r.width || !r.height || st.visibility === 'hidden' || st.display === 'none') continue;
    seen.add(e);
    const i = out.length;
    e.setAttribute('data-chk', String(i));
    const lab = e.labels && e.labels[0] ? e.labels[0].textContent : '';
    const text = (e.getAttribute('aria-label') || lab || e.textContent || e.name || e.id || e.value || e.tagName).trim().replace(/\\s+/g, ' ').slice(0, 60);
    out.push({i, tag: e.tagName.toLowerCase(), type: e.type || '', text, href: e.getAttribute('href') || '',
              action: e.dataset.action || e.dataset.change || '', arg: e.dataset.arg || '',
              w: Math.round(r.width), h: Math.round(r.height), looks: false});
  }
  // things that only LOOK clickable (a pointer cursor) without being a control: the outermost one of each
  for (const e of document.body.querySelectorAll('*')) {
    if (e.closest(sel) || e.querySelector(sel) || e.closest('[hidden]')) continue;
    if (getComputedStyle(e).cursor !== 'pointer') continue;
    const up = e.parentElement;
    if (up && up !== document.body && getComputedStyle(up).cursor === 'pointer') continue;
    const r = e.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const i = out.length;
    e.setAttribute('data-chk', String(i));
    const text = (e.getAttribute('aria-label') || e.textContent || e.tagName).trim().replace(/\\s+/g, ' ').slice(0, 60);
    out.push({i, tag: e.tagName.toLowerCase(), type: '', text, href: '', action: '', arg: '', w: Math.round(r.width),
              h: Math.round(r.height), looks: true});
  }
  return out;
}"""
STATE_JS = """() => {
  const app = document.getElementById('app') || document.body;
  let h = 0; const s = app.innerHTML;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  const open = [...document.querySelectorAll('dialog[open], details[open]')].length;
  return [location.href, h, s.length, open].join('|');
}"""
STUB_JS = "() => Boolean(document.querySelector('#proto-toast[data-proto-stub]:not([hidden])'))"
LINKS_JS = "() => [...document.querySelectorAll('a[href^=\"#/\"]')].map((a) => a.getAttribute('href'))"


def free_port() -> int:
    """An OS-assigned free TCP port on 127.0.0.1."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class QuietHandler(SimpleHTTPRequestHandler):
    """Static files without the per-request log lines."""

    def log_message(self, *_args) -> None:
        pass


def serve(folder: Path) -> tuple[ThreadingHTTPServer, int]:
    """Serve a folder on 127.0.0.1 in a daemon thread; returns the server and its port."""
    port = free_port()
    server = ThreadingHTTPServer(("127.0.0.1", port), functools.partial(QuietHandler, directory=str(folder)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, port


def variant_sets(plan: dict) -> list[dict]:
    """The first option of every fork, then each other option of one fork at a time."""
    forks = [(d["variant"], [o["key"] for o in d.get("options", []) if isinstance(o, dict) and o.get("key")])
             for d in plan.get("decisions", []) if isinstance(d, dict) and d.get("variant")]
    forks = [(name, keys) for name, keys in forks if keys]
    base = {name: keys[0] for name, keys in forks}
    sets = [base]
    for name, keys in forks:
        sets += [{**base, name: key} for key in keys[1:]]
    return sets


def safe(name: str) -> str:
    """A file-name-safe version of a fork, option or tour id."""
    return re.sub(r"[^A-Za-z0-9_-]+", "-", str(name)).strip("-") or "x"


def option_flows(plan: dict) -> list[tuple[str, str, list[dict]]]:
    """(fork, option key, steps) for every option that lists its steps."""
    out = []
    for d in plan.get("decisions", []):
        if isinstance(d, dict) and d.get("variant"):
            out += [(d["variant"], o["key"], o.get("steps") or []) for o in d.get("options", [])
                    if isinstance(o, dict) and o.get("key") and o.get("steps")]
    return out


def page_url(port: int, entry: str, route: str, variants: dict) -> str:
    """The prototype's address for a route under a set of fork options."""
    query = "&".join("v=" + urllib.parse.quote(f"{k}:{v}") for k, v in sorted(variants.items()))
    path = "/".join(urllib.parse.quote(p) for p in entry.split("/"))
    return f"http://127.0.0.1:{port}/{path}" + (f"?{query}" if query else "") + (route or "#/")


def check(plan_path: Path, phone: bool, max_routes: int, per_route: int, shots: bool = True, shots_only: bool = False) -> dict:
    """Run the click check; returns the report (routes, failures, stubs)."""
    from playwright.sync_api import Error as PwError
    from playwright.sync_api import sync_playwright

    plan = json.loads(plan_path.read_text(encoding="utf-8"))
    design = plan.get("design") or {}
    entry = str(design.get("prototype") or "").lstrip("/").removeprefix("files/")
    folder = plan_path.parent / "files"
    if not entry or not (folder / entry).is_file():
        raise SystemExit(f"Error: plan.design.prototype must name a file under {folder} (got {entry!r})")
    start = design.get("start") or "#/"
    sets = variant_sets(plan)
    base = sets[0]
    # every route reachable from the start and the journeys under the first option of every fork; each other
    # option only where it shows: the journeys that pick it, the fork's own route, and one link further
    queue: list[tuple[str, dict, int]] = []
    flows = option_flows(plan)
    for fork, key, steps in flows:
        ov = {**base, fork: key}
        queue += [(step.get("route") or "#/", ov, 99 if ov == base else 1) for step in steps]
    for journey in design.get("journeys", []):
        jv = {**base, **(journey.get("variant") or {})}
        queue += [(step.get("route") or "#/", jv, 99) for step in journey.get("steps", [])]
    queue.append((start, base, 99))
    for variants in sets[1:]:
        changed = {k: v for k, v in variants.items() if base.get(k) != v}
        fork_routes = [d.get("route") for d in plan.get("decisions", []) if isinstance(d, dict) and d.get("variant") in changed]
        queue += [(r, variants, 1) for r in fork_routes if r]
        queue += [(start, variants, 1)]
    seen: set[str] = set()
    clicked: set[str] = set()
    report: dict = {"routes": [], "failures": [], "stubs": [], "checked": 0}
    server, port = serve(folder)
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch()
            page = browser.new_page(viewport={"width": design.get("width") or 1280, "height": design.get("height") or 800})
            errors: list[str] = []
            page.on("console", lambda m: m.type == "error" and errors.append(m.text))
            page.on("pageerror", lambda e: errors.append(str(e)))

            loads = [0]
            if shots:  # a screenshot of every step: the deck shows them to compare the options at a glance
                out = folder / "shots"
                out.mkdir(exist_ok=True)
                for old in out.glob("*.jpg"):
                    old.unlink()
                todo = [(f"{safe(fork)}-{safe(key)}", steps, {**base, fork: key}) for fork, key, steps in flows]
                todo += [(f"tour-{safe(j.get('id') or j.get('title'))}", j.get("steps") or [], {**base, **(j.get("variant") or {})})
                         for j in design.get("journeys", [])]
                for stem, steps, variants in todo:
                    for n, step in enumerate(steps, 1):
                        loads[0] += 1
                        base_url, _, hashpart = page_url(port, entry, step.get("route") or "#/", variants).partition("#")
                        page.goto(f"{base_url}{'&' if '?' in base_url else '?'}_n={loads[0]}#{hashpart}")
                        page.wait_for_load_state("load")
                        page.wait_for_timeout(250)
                        if step.get("focus"):  # what matters on this screen: scroll it into view first
                            page.evaluate("(sel) => { const e = document.querySelector(sel); if (e) { e.scrollIntoView({block: 'start'});"
                                          " window.scrollBy(0, -12); } }", step["focus"])
                            page.wait_for_timeout(80)
                        page.screenshot(path=str(out / f"{stem}-{n}.jpg"), type="jpeg", quality=82)
                        report["shots"] = report.get("shots", 0) + 1
                log.info("saved %d screenshots in %s", report.get("shots", 0), out)
            if shots_only:
                queue = []

            def open_route(url: str) -> list[dict]:
                # a real load every time (a new query, not only a new #route): fresh state, no message left over
                loads[0] += 1
                base, _, hashpart = url.partition("#")
                page.goto(f"{base}{'&' if '?' in base else '?'}_n={loads[0]}#{hashpart}")
                page.wait_for_load_state("load")
                page.wait_for_timeout(60)
                return page.evaluate(TAG_JS, CONTROLS)

            while queue and len(seen) < max_routes:
                route, variants, depth = queue.pop(0)
                key = json.dumps([route, variants], sort_keys=True)
                if key in seen:
                    continue
                seen.add(key)
                url = page_url(port, entry, route, variants)
                errors.clear()
                controls = open_route(url)
                if depth > 0:
                    queue += [(href, variants, depth - 1) for href in page.evaluate(LINKS_JS)]
                tag = ", ".join(f"{k}:{v}" for k, v in sorted(variants.items()))
                where = f"{route} [{tag or 'no forks'}]"
                counts = {"works": 0, "stub": 0, "dead": 0, "out": 0, "skipped": 0}
                fresh = True
                for c in controls[:per_route]:
                    if c["href"].startswith(("http:", "https:", "mailto:", "//")):
                        counts["out"] += 1
                        report["failures"].append(f"{where}: link leaves the prototype: {c['text']!r} -> {c['href']}")
                        continue
                    if c["href"].startswith("#/") and not c["action"]:
                        counts["works"] += 1  # a link to another screen: checked by opening that screen
                        continue
                    sig = json.dumps([tag, c["tag"], c["text"], c["href"], c["action"], c["arg"]])
                    if sig in clicked:
                        counts["skipped"] += 1  # the same control, already clicked on another screen
                        continue
                    clicked.add(sig)
                    if not fresh:
                        open_route(url)
                    fresh = True
                    loc = page.locator(f'[data-chk="{c["i"]}"]')
                    before = page.evaluate(STATE_JS)
                    try:
                        if c["tag"] == "select":
                            n = loc.evaluate("(e) => e.options.length")
                            cur = loc.evaluate("(e) => e.selectedIndex")
                            if n < 2:
                                counts["skipped"] += 1
                                continue
                            loc.select_option(index=(cur + 1) % n, timeout=1500)
                        else:
                            loc.click(timeout=1500)
                    except PwError:
                        counts["skipped"] += 1  # covered or moved by an earlier control: not a dead click
                        continue
                    page.wait_for_timeout(50)
                    stub = page.evaluate(STUB_JS)
                    after = page.evaluate(STATE_JS)
                    if stub:
                        counts["stub"] += 1
                        report["stubs"].append(f"{where}: {c['text']!r}")
                        fresh = False
                    elif after != before:
                        counts["works"] += 1
                        fresh = False
                    else:
                        counts["dead"] += 1
                        what = "looks clickable but does nothing" if c["looks"] else "dead click"
                        report["failures"].append(f"{where}: {what}: {c['tag']} {c['text']!r}")
                if errors:
                    report["failures"] += [f"{where}: page error: {e}" for e in dict.fromkeys(errors)]
                report["checked"] += sum(counts.values())
                report["routes"].append({"route": where, "controls": len(controls), **counts})
                log.info("%-60s %3d controls: %d work, %d stubs, %d dead", where[:60], len(controls),
                         counts["works"], counts["stub"], counts["dead"] + counts["out"])
            if phone:
                small = browser.new_page(viewport={"width": 390, "height": 844})
                for key in sorted(seen):
                    route, variants = json.loads(key)
                    small.goto(page_url(port, entry, route, variants))
                    small.wait_for_timeout(150)
                    if small.evaluate("document.documentElement.scrollWidth > window.innerWidth + 1"):
                        report["failures"].append(f"{route}: scrolls sideways at phone width (390px)")
            browser.close()
    finally:
        server.shutdown()
    return report


def mock_flows(plan: dict) -> list[tuple[str, list[dict]]]:
    """(screenshot stem, steps) for every option and every walk-through: the same stems the deck looks for."""
    design = plan.get("design") or {}
    flows = [(f"{safe(fork)}-{safe(key)}", steps) for fork, key, steps in option_flows(plan)]
    flows += [(f"tour-{safe(j.get('id') or j.get('title'))}", j.get("steps") or []) for j in design.get("journeys", [])]
    return flows


LIVE_LINKS_JS = """() => [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href'))
  .filter((h) => h && h !== '#' && !h.startsWith('#') && !h.startsWith('javascript:'))"""


def screen_file(step: dict) -> str:
    """A step's screen, as a path under files/ ("" when it names none)."""
    return str(step.get("screen") or "").lstrip("/").removeprefix("files/") if isinstance(step, dict) else ""


# a step's `click` (the control that opens the next screen), found the way the deck's guide finds it: ring it for the
# screenshot. "old-kit" when the screen's proto-kit.js cannot find it (missing, or copied before click-to-go-on).
RING_CLICK_JS = """(spec) => {
  const P = window.Proto;
  if (!P || typeof P.findTarget !== 'function') return 'old-kit';
  const e = P.findTarget(spec);
  if (!e) return 'missing';
  const r = e.getBoundingClientRect();
  if (r.top < 0 || r.bottom > innerHeight) e.scrollIntoView({block: 'center'});
  e.style.outline = '4px solid #2563eb';  // thick: the deck shows the shot about a quarter size
  e.style.outlineOffset = '3px';
  e.style.boxShadow = '0 0 0 12px rgba(37, 99, 235, .28)';
  return 'ok';
}"""


def check_mocks(plan_path: Path, plan: dict, phone: bool) -> dict:
    """Open every mock screen once: page errors, live links and (with phone) sideways scroll fail; every step but the
    last must name a `click` found on its screen (ringed in the shot); save the shots."""
    from playwright.sync_api import sync_playwright

    design = plan.get("design") or {}
    folder = plan_path.parent / "files"
    report: dict = {"screens": [], "failures": [], "shots": 0}
    flows = mock_flows(plan)
    missing = [screen_file(st) or "(no screen)" for _, steps in flows for st in steps
               if not screen_file(st) or not (folder / screen_file(st)).is_file()]
    report["failures"] += [f"step has no screen file under {folder}: {m}" for m in dict.fromkeys(missing)]
    if not flows:
        report["failures"].append("the design has no option steps and no walk-throughs")
    out = folder / "shots"
    out.mkdir(parents=True, exist_ok=True)
    for old in out.glob("*.jpg"):
        old.unlink()
    server, port = serve(folder)
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch()
            page = browser.new_page(viewport={"width": design.get("width") or 1280, "height": design.get("height") or 800})
            small = browser.new_page(viewport={"width": 390, "height": 844}) if phone else None
            errors: list[str] = []
            page.on("console", lambda m: m.type == "error" and errors.append(m.text))
            page.on("pageerror", lambda e: errors.append(str(e)))
            seen: set[str] = set()
            old_kits: list[str] = []
            for stem, steps in flows:
                for n, step in enumerate(steps, 1):
                    screen = screen_file(step)
                    if not screen or not (folder / screen).is_file():
                        continue
                    url = f"http://127.0.0.1:{port}/" + "/".join(urllib.parse.quote(p) for p in screen.split("/"))
                    errors.clear()
                    page.goto(url)
                    page.wait_for_load_state("load")
                    page.wait_for_timeout(150)
                    if step.get("focus"):
                        page.evaluate("(sel) => { const e = document.querySelector(sel); if (e) { e.scrollIntoView({block: 'start'});"
                                      " window.scrollBy(0, -12); } }", step["focus"])
                        page.wait_for_timeout(80)
                    if n < len(steps):  # the click that opens the next screen: the deck rings it, a click on it goes on
                        spec = str(step.get("click") or step.get("target") or "").strip()
                        found = page.evaluate(RING_CLICK_JS, spec) if spec else "none"
                        if found == "none":
                            report["failures"].append(f"{stem} step {n} ({screen}): no `click`: name the control that opens the next screen")
                        elif found == "missing":
                            report["failures"].append(f"{stem} step {n} ({screen}): the click {spec!r} is not on this screen")
                        elif found == "old-kit" and screen not in old_kits:
                            old_kits.append(screen)
                    page.screenshot(path=str(out / f"{stem}-{n}.jpg"), type="jpeg", quality=82)
                    report["shots"] += 1
                    if screen in seen:
                        continue
                    seen.add(screen)
                    report["screens"].append(screen)
                    live = page.evaluate(LIVE_LINKS_JS)
                    report["failures"] += [f"{screen}: a mock's link must be inert (href=\"#\"), found {h!r}" for h in dict.fromkeys(live)]
                    if errors:
                        report["failures"] += [f"{screen}: page error: {e}" for e in dict.fromkeys(errors)]
                    if small is not None:
                        small.goto(url)
                        small.wait_for_timeout(150)
                        if small.evaluate("document.documentElement.scrollWidth > window.innerWidth + 1"):
                            report["failures"].append(f"{screen}: scrolls sideways at phone width (390px)")
            report["failures"] += [f"{s}: its proto-kit.js is missing or too old to ring the click: copy templates/proto-kit.js "
                                   "again (load it last)" for s in old_kits]
            browser.close()
    finally:
        server.shutdown()
    log.info("saved %d screenshots in %s", report["shots"], out)
    return report


def main(argv: list[str] | None = None) -> int:
    """Parse the arguments, run the check, print the summary; exit 1 when anything failed."""
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--plan", required=True, type=Path, help="absolute path to the plan.json with a design")
    parser.add_argument("--phone", action="store_true", help="also check every route at 390x844")
    parser.add_argument("--max-routes", type=int, default=80, help="stop after this many routes (default 80)")
    parser.add_argument("--per-route", type=int, default=120, help="controls clicked per route (default 120)")
    parser.add_argument("--json", type=Path, help="also write the full report here")
    parser.add_argument("--no-shots", action="store_true", help="do not save the step screenshots")
    parser.add_argument("--shots-only", action="store_true", help="only retake the step screenshots (no click check)")
    args = parser.parse_args(argv)
    if not args.plan.is_absolute():  # `uv run --directory` runs this from the skill folder
        raise SystemExit(f"Error: --plan must be an absolute path (got {args.plan})")
    try:
        plan = json.loads(args.plan.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise SystemExit(f"Error: could not read {args.plan}: {exc}") from exc
    if not isinstance(plan.get("design"), dict):
        raise SystemExit("Error: this plan has no design (no `design` object with steps to check)")
    if not plan["design"].get("prototype"):
        report = check_mocks(args.plan, plan, args.phone)
        if args.json:
            args.json.write_text(json.dumps(report, indent=1), encoding="utf-8")
        print(f"Checked {len(report['screens'])} screens; {report.get('shots', 0)} step screenshots saved.")
        for line in report["failures"]:
            print("FAIL " + line)
        print("MOCKS OK" if not report["failures"] else f"MOCKS HAVE {len(report['failures'])} PROBLEMS")
        return 0 if not report["failures"] else 1
    report = check(args.plan, args.phone and not args.shots_only, args.max_routes, args.per_route, shots=not args.no_shots,
                   shots_only=args.shots_only)
    if args.json:
        args.json.write_text(json.dumps(report, indent=1), encoding="utf-8")
    stubs = report["stubs"]
    print(f"Checked {len(report['routes'])} routes, {report['checked']} controls; {len(stubs)} stubs (outside this design); "
          f"{report.get('shots', 0)} step screenshots saved.")
    for line in report["failures"]:
        print("FAIL " + line)
    if stubs:
        print("Stubs: " + "; ".join(dict.fromkeys(s.split(": ", 1)[1] for s in stubs)))
    if args.shots_only:
        print("SHOTS ONLY: no click check ran")
    print("PROTOTYPE OK" if not report["failures"] else f"PROTOTYPE HAS {len(report['failures'])} PROBLEMS")
    return 0 if not report["failures"] else 1


if __name__ == "__main__":
    sys.exit(main())
