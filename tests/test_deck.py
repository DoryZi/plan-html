"""Browser checks on the plan deck (templates/deck.html), served by serve_plan.py from the example plan.

Run: uv run --directory <this skill> --with pytest --with playwright pytest tests
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
from collections.abc import Iterator
from pathlib import Path

import pytest
from playwright.sync_api import Page, sync_playwright

SKILL = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="module")
def deck_url(tmp_path_factory: pytest.TempPathFactory) -> Iterator[str]:
    """Serve a copy of the example plan with one intent that has a walk-through; yield the deck's URL."""
    root = tmp_path_factory.mktemp("deck")
    shutil.copytree(SKILL / "examples" / "prototype", root, dirs_exist_ok=True)
    plan = json.loads((root / "plan.json").read_text(encoding="utf-8"))
    plan["intents"] = [{"id": "i-find", "title": "Find a job by where", "journey": "find",
                        "intent": "I want to filter the jobs by where and open a company.",
                        "verify": {"method": "e2e", "command": "golden find", "expected": "The filter and the company open."}}]
    (root / "plan.json").write_text(json.dumps(plan), encoding="utf-8")
    proc = subprocess.Popen([sys.executable, str(SKILL / "serve_plan.py"), "--plan", str(root / "plan.json"),
                             "--no-open", "--timeout", "300"], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
    try:
        for line in proc.stderr:
            m = re.search(r"open this URL to review: (\S+)", line)
            if m:
                yield m.group(1)
                break
        else:
            pytest.fail("serve_plan.py did not start")
    finally:
        proc.kill()


def _page(url: str, width: int) -> Iterator[Page]:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": 900})
        errors: list[str] = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(url)
        page.wait_for_timeout(1500)
        yield page
        assert not errors
        browser.close()


@pytest.fixture(scope="module")
def mocks_url(tmp_path_factory: pytest.TempPathFactory) -> Iterator[str]:
    """Serve a copy of the mocks example (one round: a question as mock screens, the plan written for the recommended
    option); yield the deck's URL and keep the server's stdout for the pick events."""
    root = tmp_path_factory.mktemp("mocks")
    shutil.copytree(SKILL / "examples" / "mocks", root, dirs_exist_ok=True)
    proc = subprocess.Popen([sys.executable, str(SKILL / "serve_plan.py"), "--plan", str(root / "plan.json"),
                             "--no-open", "--timeout", "300"], stdout=(root / "out.txt").open("w"), stderr=subprocess.PIPE, text=True)
    try:
        for line in proc.stderr:
            m = re.search(r"open this URL to review: (\S+)", line)
            if m:
                yield m.group(1) + "#" + str(root / "out.txt")
                break
        else:
            pytest.fail("serve_plan.py did not start")
    finally:
        proc.kill()


@pytest.fixture
def mocks(mocks_url: str) -> Iterator[tuple[Page, Path]]:
    url, _, out = mocks_url.partition("#")
    for page in _page(url, 1280):
        yield page, Path(out)


@pytest.fixture
def desktop(deck_url: str) -> Iterator[Page]:
    yield from _page(deck_url, 1280)


@pytest.fixture
def phone(deck_url: str) -> Iterator[Page]:
    yield from _page(deck_url, 390)


def _leave(page: Page) -> None:
    page.mouse.move(2, 2)
    page.locator("#progtxt").click()
    page.wait_for_timeout(300)


def test_an_answered_card_folds_away_and_leaves_whats_left(desktop: Page) -> None:
    """A pick closes the card and marks it answered; with Show what's left on it is gone at once, the pointer still on it."""
    card = desktop.locator('.card[data-id="i-find"]')
    card.locator(".card-title").click()
    assert "open" in card.get_attribute("class")
    card.locator(".card-body").get_by_role("button", name="This is what I want").click()
    classes = card.get_attribute("class").split()
    assert "answered" in classes and "open" not in classes
    assert card.locator(".state").inner_text() == "answered"
    desktop.locator("#leftToggle").click()
    assert not card.is_visible()
    _leave(desktop)
    assert card.evaluate("e => getComputedStyle(e).opacity") == "0.62"


def test_a_click_on_the_middle_of_a_card_head_opens_it(desktop: Page) -> None:
    """The quick answers in a closed card's head stay small: a click on the head's middle opens the card, it does not answer it."""
    card = desktop.locator('.card[data-id="i-find"]')
    card.locator(".card-head").click()
    classes = card.get_attribute("class").split()
    assert "open" in classes and "answered" not in classes


def test_whats_left_is_always_in_the_dock(desktop: Page) -> None:
    """The progress chip sits in the floating dock from the start and is the "what's left" filter."""
    button = desktop.locator("#submitbar").get_by_role("button", name=re.compile(r"\d+ of \d+ · \d+ left"))
    assert button.is_visible()
    assert button.get_attribute("aria-pressed") == "false"
    button.click()
    shown = desktop.locator("#submitbar").get_by_role("button", name=re.compile("left · show all"))
    assert shown.is_visible()
    assert shown.get_attribute("aria-pressed") == "true"


@pytest.mark.parametrize("width", [1280, 390])
def test_the_dock_is_one_hint_line_and_a_row_of_tools(desktop: Page, width: int) -> None:
    """The dock: a one-line hint, the chip, Expand all, Send and Finalize; the theme switch is at the page top."""
    desktop.set_viewport_size({"width": width, "height": 844})
    dock = desktop.locator("#submitbar")
    hint = desktop.locator("#substatus")
    assert "—" not in hint.inner_text()
    if width == 1280:
        assert hint.bounding_box()["height"] < 34  # one line
    for button in ("#leftToggle", "#expandAll", "#sendRound", "#finalize"):
        assert dock.locator(button).is_visible()
    assert dock.locator("#expandAll").inner_text() == "Expand all"
    assert dock.locator("#themeBtn").count() == 0
    theme = desktop.locator("#topRow").get_by_role("button", name="Switch theme")
    before = desktop.evaluate("document.documentElement.dataset.theme")
    theme.click()
    assert desktop.evaluate("document.documentElement.dataset.theme") != before
    box = dock.bounding_box()
    assert box["x"] >= 0 and box["x"] + box["width"] <= width
    assert dock.evaluate("e => e.scrollWidth <= e.clientWidth")


def test_a_picked_question_folds_away_and_stays_closed(desktop: Page) -> None:
    """A design question starts expanded; a Pick closes it, marks it answered, and a redraw does not open it again."""
    card = desktop.locator('.card[data-id="fork-linking"]')
    assert "open" in card.get_attribute("class")
    card.locator(".fl-row").first.get_by_role("button", name="Pick").click()
    _leave(desktop)
    assert "open" not in card.get_attribute("class").split()
    assert card.evaluate("e => getComputedStyle(e).opacity") == "0.62"
    desktop.reload()
    desktop.wait_for_timeout(1500)
    classes = desktop.locator('.card[data-id="fork-linking"]').get_attribute("class").split()
    assert "answered" in classes and "open" not in classes


def test_intent_screens_sit_next_to_its_words(desktop: Page) -> None:
    """An intent with a walk-through shows its screens to the right of its text."""
    card = desktop.locator('.card[data-id="i-find"]')
    card.locator(".card-title").click()
    text = card.locator(".card-main").bounding_box()
    shots = card.locator(".card-screens").bounding_box()
    assert card.locator(".card-screens .fl-screen").count() == 3
    assert shots["x"] >= text["x"] + text["width"]
    assert shots["y"] < text["y"] + 60


def test_intent_screens_follow_its_words_on_a_phone(phone: Page) -> None:
    """At 390 wide the screens stack right under the intent's text, before the rest, with no sideways scroll."""
    card = phone.locator('.card[data-id="i-find"]')
    card.locator(".card-title").click()
    shots_top = card.locator(".card-screens").bounding_box()["y"]
    assert card.get_by_text("The intent", exact=True).bounding_box()["y"] < shots_top
    assert card.get_by_text("How we verify this", exact=True).bounding_box()["y"] > shots_top
    assert phone.evaluate("document.documentElement.scrollWidth") <= 390


def _opens_step(page: Page, screens, step: int) -> None:
    screens.nth(step).click()
    page.wait_for_timeout(1200)
    assert f"Step {step + 1} of 3" in page.locator(".fc-title").inner_text()


@pytest.mark.parametrize("step", [0, 1, 2])
def test_a_screen_opens_its_own_step(desktop: Page, step: int) -> None:
    """A click on step N's screen opens the prototype at step N, also when steps share a page (#/jobs, #/jobs?scenario=)."""
    row = desktop.locator(".ds-tours .fl-row").filter(has=desktop.get_by_text("Find a job in the table", exact=True))
    _opens_step(desktop, row.locator(".fl-screen-btn"), step)


def test_an_intent_screen_opens_its_step(desktop: Page) -> None:
    """A screen on the intent card opens the prototype live at that step."""
    card = desktop.locator('.card[data-id="i-find"]')
    card.locator(".card-title").click()
    _opens_step(desktop, card.locator(".card-screens .fl-screen-btn"), 1)



def test_a_mock_step_opens_full_size_and_takes_a_pinned_note(mocks: tuple[Page, Path]) -> None:
    """A step that names a screen file opens that file in the viewer at its step; 💬 Comment pins a note to an element."""
    page, _ = mocks
    card = page.locator('.card[data-id="fork-linking"]')
    row = card.locator(".fl-row").nth(2)  # option C
    row.locator(".fl-screen-btn").nth(1).click()
    page.wait_for_timeout(1200)
    assert "Step 2 of 4" in page.locator(".fc-title").inner_text()
    frame = next(f for f in page.frames if "files/mocks/linking-c-2.html" in f.url)
    assert frame.locator("body").count() == 1
    page.get_by_role("button", name="💬 Comment").click()
    frame.locator("h1, h2").first.click()
    page.locator(".fv-bubble textarea").fill("make this bolder")
    page.locator(".fv-bubble textarea").press("Enter")
    page.wait_for_timeout(300)
    note = page.evaluate("() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => k.startsWith('plan-html:'))) || '{}').design.notes[0]")
    assert note["text"] == "make this bolder" and note["route"] == "mocks/linking-c-2.html" and note.get("element")


def test_a_click_on_the_ringed_control_opens_the_next_screen(mocks: tuple[Page, Path]) -> None:
    """▶ Try it opens step 1 with the step's `click` ringed; a click on it opens the next screen, a click elsewhere
    does nothing."""
    page, _ = mocks
    row = page.locator('.card[data-id="fork-linking"]').locator(".fl-row").nth(2)  # option C
    row.get_by_role("button", name="▶ Try it").click()
    page.wait_for_timeout(1200)
    assert "Step 1 of 4" in page.locator(".fc-title").inner_text()
    frame = next(f for f in page.frames if "files/mocks/linking-c-1.html" in f.url)
    assert frame.get_by_text("Click it to go on").is_visible()
    frame.get_by_role("link", name="Brightline Health", exact=True).click()
    page.wait_for_timeout(600)
    assert "Step 1 of 4" in page.locator(".fc-title").inner_text()
    frame.get_by_role("link", name="2 to confirm", exact=True).click()
    page.wait_for_timeout(1200)
    assert "Step 2 of 4" in page.locator(".fc-title").inner_text()
    assert any("files/mocks/linking-c-2.html" in f.url for f in page.frames)


def _viewer_open(page: Page) -> bool:
    return page.get_by_role("dialog", name="Use the prototype").is_visible()


def test_steps_add_no_history_and_back_closes_the_viewer(mocks: tuple[Page, Path]) -> None:
    """Each step replaces the screen in the frame (no browser history entry per step), so the browser's Back closes
    the viewer and stays in the deck, and a second Back is not spent on screens hidden in the frame."""
    page, _ = mocks
    url, before = page.url, page.evaluate("history.length")
    row = page.locator('.card[data-id="fork-linking"]').locator(".fl-row").nth(2)  # option C
    row.get_by_role("button", name="▶ Try it").click()
    page.wait_for_timeout(1200)
    assert page.evaluate("history.length") == before + 1  # the open viewer, nothing else
    frame = next(f for f in page.frames if "files/mocks/linking-c-1.html" in f.url)
    frame.get_by_role("link", name="2 to confirm", exact=True).click()
    page.wait_for_timeout(1200)
    page.get_by_role("button", name="Next step").click()
    page.wait_for_timeout(1200)
    page.get_by_role("button", name="Previous step").click()
    page.wait_for_timeout(1200)
    assert "Step 2 of 4" in page.locator(".fc-title").inner_text()
    assert any("files/mocks/linking-c-2.html" in f.url for f in page.frames)
    assert page.evaluate("history.length") == before + 1
    page.evaluate("history.back()")
    page.wait_for_timeout(600)
    assert not _viewer_open(page)
    assert page.url == url and page.locator("#finalize").is_visible()


def test_close_leaves_no_history_behind(mocks: tuple[Page, Path]) -> None:
    """✕ Close and Esc close the viewer and take its history entry with them: the next open is one Back from the deck."""
    page, _ = mocks
    url = page.url
    row = page.locator('.card[data-id="fork-linking"]').locator(".fl-row").nth(2)
    for close in (lambda: page.get_by_role("button", name="Close the prototype").click(), lambda: page.keyboard.press("Escape")):
        row.get_by_role("button", name="▶ Try it").click()
        page.wait_for_timeout(1200)
        page.get_by_role("button", name="Next step").click()
        page.wait_for_timeout(1200)
        assert page.evaluate("Boolean(history.state && history.state.planHtmlViewer)")
        close()
        page.wait_for_timeout(600)
        assert not _viewer_open(page)
        assert not page.evaluate("Boolean(history.state && history.state.planHtmlViewer)")
        assert page.url == url


def test_one_round_finalizes_and_a_pick_reaches_the_server(mocks: tuple[Page, Path]) -> None:
    """With the design open next to the intents, the button is Finalize (no Lock round); a Pick is sent at once."""
    page, out = mocks
    assert page.locator("#finalize").inner_text().strip() == "Finalize plan"
    card = page.locator('.card[data-id="fork-linking"]')
    card.locator(".fl-row").nth(2).get_by_role("button", name="Pick").click()
    page.wait_for_timeout(500)
    lines = [json.loads(ln) for ln in out.read_text().splitlines() if ln.startswith("{")]
    assert {"action": "pick", "cardId": "fork-linking", "choice": "C. Link when sure, ask when not", "round": 1} in lines


def test_boundaries_do_not_count_as_required(mocks: tuple[Page, Path]) -> None:
    page, _ = mocks
    text = page.locator("#substatus").inner_text()
    assert "5 required cards" in text  # 4 intents and the question; not the boundary


@pytest.mark.parametrize("close", ["button", "escape", "back"])
def test_viewer_restores_focus_and_scroll(mocks: tuple[Page, Path], close: str) -> None:
    page, _ = mocks
    opener = page.get_by_role("button", name="▶ Try it").first
    opener.scroll_into_view_if_needed()
    opener.focus()
    scroll = page.evaluate("scrollY")
    opener.click()
    page.wait_for_timeout(300)
    assert page.get_by_role("button", name="Close the prototype").evaluate("e => e === document.activeElement")
    if close == "button":
        page.get_by_role("button", name="Close the prototype").click()
    elif close == "escape":
        page.keyboard.press("Escape")
    else:
        page.go_back()
    page.wait_for_timeout(400)
    assert not _viewer_open(page)
    assert opener.evaluate("e => e === document.activeElement")
    assert abs(page.evaluate("scrollY") - scroll) <= 1


def test_viewer_step_ends_and_stable_device(mocks: tuple[Page, Path]) -> None:
    page, _ = mocks
    row = page.locator('.card[data-id="fork-linking"] .fl-row').nth(2)
    row.get_by_role("button", name="▶ Try it").click()
    page.wait_for_timeout(500)
    prev = page.get_by_role("button", name="Previous step")
    next_step = page.get_by_role("button", name="Next step")
    assert prev.is_disabled() and next_step.is_enabled()
    box = page.locator(".fv-device").bounding_box()
    for i in range(3):
        next_step.click()
        page.wait_for_timeout(400)
        assert page.locator(".fv-device").bounding_box() == box
    assert next_step.is_disabled() and prev.is_enabled()
    prev.click()
    assert next_step.is_enabled()


def test_viewer_phone_controls_fit(phone: Page) -> None:
    phone.set_viewport_size({"width": 390, "height": 844})
    phone.get_by_role("button", name="▶ Try it").first.click()
    phone.wait_for_timeout(500)
    viewer = phone.get_by_role("dialog", name="Use the prototype")
    assert viewer.evaluate("e => e.scrollWidth <= e.clientWidth")
    for button in viewer.locator(".fc-bar button:visible").all():
        box = button.bounding_box()
        assert box["height"] >= 44
        assert box["x"] >= 0 and box["x"] + box["width"] <= 390


def test_ring_is_clickable_at_its_drawn_phone_position(mocks: tuple[Page, Path]) -> None:
    page, _ = mocks
    page.set_viewport_size({"width": 390, "height": 844})
    page.locator('.card[data-id="fork-linking"] .fl-row').nth(2).get_by_role("button", name="▶ Try it").click()
    page.wait_for_timeout(800)
    frame = next(f for f in page.frames if "linking-c-1.html" in f.url)
    ring = frame.locator('div[style*="z-index: 9996"]')
    box = ring.bounding_box()
    target = frame.get_by_role("link", name="2 to confirm", exact=True).bounding_box()
    assert abs(box["x"] + box["width"] / 2 - target["x"] - target["width"] / 2) < 1
    assert abs(box["y"] + box["height"] / 2 - target["y"] - target["height"] / 2) < 1
    page.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    page.wait_for_timeout(500)
    assert "Step 2 of 4" in page.locator(".fc-title").inner_text()


def test_viewer_reduced_motion(mocks: tuple[Page, Path]) -> None:
    page, _ = mocks
    page.emulate_media(reduced_motion="reduce")
    page.get_by_role("button", name="▶ Try it").first.click()
    assert page.locator(".fv").evaluate("e => getComputedStyle(e).transitionDuration") == "0s"


def test_step_keeps_old_screen_until_new_screen_loads(mocks: tuple[Page, Path]) -> None:
    page, _ = mocks
    page.locator('.card[data-id="fork-linking"] .fl-row').nth(2).get_by_role("button", name="▶ Try it").click()
    page.wait_for_timeout(600)
    pending = []
    page.route("**/files/mocks/linking-c-2.html*", lambda route: pending.append(route))
    old = next(f for f in page.frames if "linking-c-1.html" in f.url)
    box = page.locator(".fv-device").bounding_box()
    page.get_by_role("button", name="Next step").click()
    page.wait_for_timeout(300)
    assert pending
    assert not old.is_detached()
    assert old.frame_element().is_visible()
    assert page.locator(".fv-device").bounding_box() == box
    assert page.locator('.fv-device').get_attribute("aria-busy") == "true"
    pending[0].continue_()
    page.wait_for_timeout(600)
    assert old.is_detached()
    assert page.locator('.fv-device').get_attribute("aria-busy") == "false"


def test_a_section_folds_from_its_heading_and_stays_folded(desktop: Page) -> None:
    """A click on a section's heading folds it (its cards go, the heading stays); a reload keeps it folded; the
    reference sections start folded."""
    toggle = desktop.get_by_role("button", name=re.compile("User intent"), exact=False).first
    card = desktop.locator('.card[data-id="i-find"]')
    assert card.is_visible() and toggle.get_attribute("aria-expanded") == "true"
    assert desktop.locator("#stepsWrap .sec-toggle").get_attribute("aria-expanded") == "false"
    toggle.click()
    assert not card.is_visible() and toggle.get_attribute("aria-expanded") == "false"
    desktop.reload()
    desktop.wait_for_timeout(1500)
    assert not desktop.locator('.card[data-id="i-find"]').is_visible()
    desktop.locator("#intentsWrap .sec-toggle").click()
    assert desktop.locator('.card[data-id="i-find"]').is_visible()


def test_section_help_shows_on_demand(desktop: Page) -> None:
    """A section's explainer is hidden until its ? button is pressed."""
    hint = desktop.locator("#intentsWrap > .sechint")
    assert not hint.is_visible()
    desktop.get_by_role("button", name="About User intent").click()
    assert hint.is_visible()


def test_the_menu_lists_the_deck_and_jumps_to_a_card(desktop: Page) -> None:
    """The menu names each section with its count; a section's cards show once it is picked, and a click on a card
    opens it and brings it into view, also when its section was folded."""
    menu = desktop.get_by_role("navigation", name="Sections")
    assert menu.is_visible()
    assert menu.get_by_role("button", name=re.compile("User intent")).is_visible()
    find = menu.get_by_role("button", name=re.compile("Find a job by where"))
    assert not find.is_visible()  # the menu starts as sections only
    desktop.locator("#intentsWrap .sec-toggle").click()  # fold it first
    menu.get_by_role("button", name=re.compile("User intent")).click()
    find.click()
    desktop.wait_for_timeout(900)
    card = desktop.locator('.card[data-id="i-find"]')
    assert "open" in card.get_attribute("class").split()
    top = card.bounding_box()["y"]
    assert 0 <= top < 400
    assert desktop.evaluate("document.documentElement.scrollWidth") <= 1280


def test_the_menu_opens_from_the_dock_on_a_phone(phone: Page) -> None:
    """At 390 wide the menu is closed until the dock's Sections button is pressed; a pick in it closes it again."""
    menu = phone.get_by_role("navigation", name="Sections")
    assert not menu.is_visible()
    phone.locator("#submitbar").get_by_role("button", name="Sections").click()
    assert menu.is_visible()
    box = menu.bounding_box()
    assert box["x"] >= 0 and box["x"] + box["width"] <= 390
    menu.get_by_role("button", name=re.compile("User intent")).click()
    menu.get_by_role("button", name=re.compile("Find a job by where")).click()
    phone.wait_for_timeout(900)
    assert not menu.is_visible()
    assert "open" in phone.locator('.card[data-id="i-find"]').get_attribute("class").split()
    assert phone.evaluate("document.documentElement.scrollWidth") <= 390


def test_a_card_opens_lean_and_the_rest_is_on_demand(desktop: Page) -> None:
    """An open card shows its statement and the decision; the agent box and the own-words box open from their buttons,
    and "Not quite" opens the own-words box since that answer needs words."""
    card = desktop.locator('.card[data-id="i-find"]')
    card.locator(".card-title").click()
    chat = card.locator(".chat-input")
    own = card.get_by_placeholder(re.compile("Or answer in your own words"))
    assert not chat.is_visible() and not own.is_visible()
    card.get_by_role("button", name=re.compile("Ask the agent")).click()
    assert chat.is_visible()
    card.locator(".opts").get_by_role("button", name=re.compile("Not quite")).click()
    assert own.is_visible()
    assert "open" in card.get_attribute("class").split()


def test_the_top_of_the_page_opens_on_demand(desktop: Page) -> None:
    """How the deck works and the interview are one row of buttons under the goal; each opens its part."""
    howto, interview = desktop.locator("#howtoD"), desktop.locator("#redesignBar")
    assert not howto.is_visible() and not interview.is_visible()
    desktop.locator("#topRow").get_by_role("button", name="How it works").click()
    assert howto.is_visible() and desktop.locator("#howtoD .howto").is_visible()
    desktop.locator("#topRow").get_by_role("button", name="Interview me").click()
    assert interview.is_visible()


def test_an_agent_reply_on_an_open_card_shows_without_a_click(desktop: Page) -> None:
    """A card whose thread ends with the agent's reply and that has no answer yet shows its agent box when the deck
    is drawn, so a reply is still in view after a reload."""
    desktop.evaluate("""() => {
        app.store.plan.intents[0].thread = [{ role: "user", text: "why?" }, { role: "agent", text: "because" }];
        app.renderSections();
    }""")
    card = desktop.locator('.card[data-id="i-find"]')
    card.locator(".card-title").click()
    assert card.locator(".thread .who.agent").is_visible()
    assert card.get_by_role("button", name="💬 Ask the agent (2)").get_attribute("aria-expanded") == "true"


_SPILLS = """() => [...document.querySelectorAll('#diagram .fk-lbl')].filter(
    (d) => d.scrollHeight > d.clientHeight + 1 || d.scrollWidth > d.clientWidth + 1).length"""


def test_the_plan_diagram_is_drawn_from_its_boxes_and_arrows(mocks: tuple[Page, Path]) -> None:
    """The plan's diagram comes as boxes and arrows with no coordinates: the deck draws every box, the text fits, and
    a box that names a card opens that card instead of enlarging the diagram."""
    page, _ = mocks
    page.locator("#diagramWrap .sec-toggle").click()
    boxes = page.locator("#diagram .fk-node")
    assert boxes.count() == 4 and page.locator("#diagram .fk-edge").count() == 3
    assert page.evaluate(_SPILLS) == 0
    step = page.locator('.card[data-id="s-match"]')
    assert not step.is_visible()
    boxes.nth(1).click()
    page.wait_for_timeout(700)
    assert step.is_visible() and "open" in step.get_attribute("class").split()
    assert "show" not in (page.locator("#lightbox").get_attribute("class") or "").split()


def test_long_words_and_arrows_that_share_a_gap_stay_tidy(desktop: Page) -> None:
    """Text too long for a box is cut inside it, boxes without a place are laid out in rows, and two arrows that
    run through the same gap get their own lane, so their labels do not sit on each other."""
    desktop.evaluate("""() => {
        const n = (id, col, row, title) => ({ id, col, row, kind: "api", title, sub: "a second line with far more words than two lines of a box can hold, by a wide margin" });
        app.store.plan.diagram = { nodes: [
            n("a", 1, 1, "A very long title that would never fit in one box however hard it tried to"),
            n("b", 2, 1, "B"), n("c", 3, 1, "C"), n("d", 1, 2, "D"), n("e", 2, 2, "E"), n("f", 3, 2, "F")],
          edges: [["a", "b"], ["c", "d", "first label"], ["a", "f", "second label"], ["a", "c", "over the top"]] };
        app.renderSections();
    }""")
    desktop.locator("#diagramWrap .sec-toggle").click()
    assert desktop.locator("#diagram .fk-node").count() == 6
    assert desktop.evaluate(_SPILLS) == 0
    overlaps = desktop.evaluate("""() => {
        const r = [...document.querySelectorAll('#diagram .fk-elabel')].map((g) => g.getBoundingClientRect());
        let hits = 0;
        r.forEach((a, i) => r.slice(i + 1).forEach((b) => {
            if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) hits += 1;
        }));
        return [r.length, hits];
    }""")
    assert overlaps == [3, 0]
    desktop.evaluate("""() => {
        app.store.plan.diagram = { nodes: [1, 2, 3, 4, 5, 6, 7].map((i) => ({ id: "n" + i, title: "Step " + i })),
          edges: [["n1", "n2"], ["n5", "n6"]] };
        app.renderSections();
    }""")
    ys = desktop.evaluate("() => [...document.querySelectorAll('#diagram .fk-node rect')].map((r) => +r.getAttribute('y'))")
    assert len(ys) == 7 and len(set(ys)) == 2 and ys[0] == ys[4] and ys[5] == ys[6] > ys[0]


def test_a_hand_drawn_diagram_still_shows(desktop: Page) -> None:
    """A plan written before the flow kit carries its diagram as SVG: it is drawn as before."""
    desktop.evaluate("""() => {
        delete app.store.plan.diagram;
        app.store.plan.diagramSvg = "<rect class='node' x='20' y='20' width='140' height='48'/>";
        app.renderSections();
    }""")
    desktop.locator("#diagramWrap .sec-toggle").click()
    assert desktop.locator("#diagram rect.node").count() == 1 and desktop.locator("#diagram .fk-node").count() == 0


_TWO_LANES = """{ nodes: [
    { id: "a", kind: "screen", col: 1, row: 1, title: "Screen" }, { id: "b", kind: "api", col: 2, row: 1, title: "API" },
    { id: "c", kind: "data", col: 3, row: 1, title: "Store" }, { id: "d", kind: "job", col: 4, row: 1, title: "Job" },
    { id: "e", kind: "agent", col: 5, row: 1, title: "Agent" }],
  edges: [["a", "b"], ["b", "c"], ["c", "d"], ["d", "e"]] }"""


def test_a_card_diagram_scrolls_inside_a_phone_card(phone: Page) -> None:
    """On a phone a wide diagram in a card with screens stays inside the card and scrolls sideways there (it used to
    widen the card's content past the card's edge, where it was cut off and out of reach)."""
    phone.evaluate("() => { app.store.plan.intents[0].diagram = %s; app.renderSections(); }" % _TWO_LANES)
    card = phone.locator('.card[data-id="i-find"]')
    card.locator(".card-title").click()
    box = card.locator(".diagram.fk")
    box.scroll_into_view_if_needed()
    inside, scrolls, page_wide = phone.evaluate("""() => {
        const card = document.querySelector('.card[data-id="i-find"]'), d = card.querySelector('.diagram.fk');
        return [d.getBoundingClientRect().right <= card.getBoundingClientRect().right + 1, d.scrollWidth > d.clientWidth,
                document.documentElement.scrollWidth > innerWidth + 1];
    }""")
    assert inside and scrolls and not page_wide


def test_the_enlarged_diagram_is_clean_and_full_size(desktop: Page) -> None:
    """A click on a box that opens no card enlarges the diagram: the copy carries no dimmed boxes from the hover and
    is at least as large as the diagram on the page."""
    desktop.evaluate("() => { app.store.plan.diagram = %s; app.renderSections(); }" % _TWO_LANES)
    desktop.locator("#diagramWrap .sec-toggle").click()
    inline = desktop.locator("#diagram svg").bounding_box()["width"]
    desktop.locator("#diagram .fk-node").nth(2).hover()
    assert desktop.locator("#diagram .fk-dim").count() > 0
    desktop.locator("#diagram .fk-node").nth(2).click()
    assert "show" in desktop.locator("#lightbox").get_attribute("class").split()
    assert desktop.locator("#lbContent .fk-node").count() == 5 and desktop.locator("#lbContent .fk-dim").count() == 0
    assert desktop.locator("#lbContent svg").bounding_box()["width"] >= inline - 1


def test_awkward_diagrams_stay_inside_the_frame(desktop: Page) -> None:
    """Arrows over the first row and labels stay inside the drawing, an arrow down a column goes around the box in
    between, and a broken arrow or an odd kind name does not stop the deck."""
    desktop.evaluate("""() => {
        const n = (id, col, row, kind) => ({ id, col, row, kind, title: id });
        app.store.plan.diagram = { nodes: [n("a", 1, 1, "api"), n("b", 2, 1, "constructor"), n("c", 3, 1), n("d", 1, 2), n("e", 1, 3)],
          edges: [["a", "c", "skips one"], ["c", "a", "and back, with a label that is far too long to fit anywhere"], ["a", "e", "around"],
                  null, 7, ["a", "toString"], ["constructor", "a"]] };
        app.renderSections();
    }""")
    desktop.locator("#diagramWrap .sec-toggle").click()
    assert desktop.locator("#diagram .fk-node").count() == 5 and desktop.locator("#diagram .fk-edge").count() == 3
    assert desktop.locator("#diagram .fk-node").nth(1).locator(".fk-tag").inner_text().lower() == "constructor"
    out, around, longest = desktop.evaluate("""() => {
        const svg = document.querySelector('#diagram svg'), f = svg.getBoundingClientRect();
        const out = [...svg.querySelectorAll('.fk-elabel rect, .fk-edge')].filter((e) => {
            const r = e.getBoundingClientRect();
            return r.top < f.top - 1 || r.bottom > f.bottom + 1 || r.left < f.left - 1 || r.right > f.right + 1;
        }).length;
        const mid = svg.querySelector('.fk-node[data-n="d"] rect').getBoundingClientRect();
        const side = svg.querySelector('.fk-edge[data-a="a"][data-b="e"]').getBoundingClientRect();
        const longest = Math.max(...[...svg.querySelectorAll('.fk-elabel text')].map((t) => t.textContent.length));
        return [out, side.right > mid.right, longest];
    }""")
    assert out == 0 and around and longest <= 30
