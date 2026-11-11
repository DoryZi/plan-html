"""check_prototype.py on mock screens: every step but the last names the control that opens the next screen
(`click`), that control is on its screen, and the screen's proto-kit.js is new enough to ring it and go on.

Run: uv run --directory <this skill> --with pytest --with playwright pytest tests
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

SKILL = Path(__file__).resolve().parents[1]


@pytest.fixture
def example(tmp_path: Path) -> Path:
    """A copy of the mocks example; returns its plan.json."""
    shutil.copytree(SKILL / "examples" / "mocks", tmp_path, dirs_exist_ok=True)
    return tmp_path / "plan.json"


def _run(plan_path: Path) -> tuple[int, str]:
    r = subprocess.run([sys.executable, str(SKILL / "check_prototype.py"), "--plan", str(plan_path)],
                       check=False, capture_output=True, text=True, timeout=300)
    return r.returncode, r.stdout + r.stderr


def _only_add_email(plan_path: Path) -> dict:
    """Trim the example to its add-email walk-through (a faster check); returns that tour."""
    plan = json.loads(plan_path.read_text(encoding="utf-8"))
    plan["decisions"] = [d for d in plan["decisions"] if not d.get("variant")]
    tour = next(j for j in plan["design"]["journeys"] if j["id"] == "add-email")
    plan["design"]["journeys"] = [tour]
    plan_path.write_text(json.dumps(plan), encoding="utf-8")
    return tour


def _edit_tour(plan_path: Path, edit) -> None:
    plan = json.loads(plan_path.read_text(encoding="utf-8"))
    edit(plan["design"]["journeys"][0]["steps"])
    plan_path.write_text(json.dumps(plan), encoding="utf-8")


def test_the_example_names_a_click_on_every_step_and_passes(example: Path) -> None:
    """The worked example: every step but the last has a `click` found on its screen; MOCKS OK."""
    code, out = _run(example)
    assert code == 0 and "MOCKS OK" in out, out


def test_a_click_that_is_not_on_its_screen_or_missing_fails(example: Path) -> None:
    """A `click` the screen does not have fails, and so does a step (not the last) with no `click`."""
    _only_add_email(example)

    def edit(steps: list[dict]) -> None:
        steps[0]["click"] = "Book a meeting"
        steps[1].pop("click", None)
        steps[-1].pop("click", None)  # the last step needs none

    _edit_tour(example, edit)
    code, out = _run(example)
    assert code == 1, out
    assert "'Book a meeting' is not on this screen" in out
    assert "tour-add-email step 2" in out and "no `click`" in out
    assert "step 4" not in out


def test_a_click_finds_the_control_not_a_column_header_with_its_words(example: Path) -> None:
    """add-email-2 has a column header that reads "Attach" (screen-reader text) before the Attach buttons: the
    click goes to the button, so the ring and click-to-go-on sit on what the user clicks."""
    from playwright.sync_api import sync_playwright

    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page()
        page.goto((example.parent / "files" / "mocks" / "add-email-2.html").as_uri())
        page.wait_for_timeout(200)
        tag = page.evaluate("() => { const e = window.Proto.findTarget('Attach'); return e && e.tagName; }")
        browser.close()
    assert tag in ("A", "BUTTON")


def test_a_screen_with_an_old_kit_fails(example: Path) -> None:
    """A mock folder whose proto-kit.js cannot find a step's control (copied before click-to-go-on) fails, saying so."""
    _only_add_email(example)
    kit = example.parent / "files" / "mocks" / "proto-kit.js"
    old = kit.read_text(encoding="utf-8").replace("P.findTarget = findTarget;", "")
    kit.write_text(old, encoding="utf-8")
    code, out = _run(example)
    assert code == 1, out
    assert "copy templates/proto-kit.js again" in out
