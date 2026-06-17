import { test, expect } from "./fixtures.js";

test("loads the deck with the plan's title and sections", async ({ page, deck }) => {
  await page.goto(deck.url);
  await expect(page.locator("#title")).toHaveText("E2E plan");
  await expect(page.locator("#goalText")).toContainText("Exercise the deck UI");
  // sections render
  await expect(page.locator("#intents .card")).toHaveCount(1);
  await expect(page.locator("#decisions .card")).toHaveCount(1);
});

test("add intent: + button opens a blank authoring card, autosaves", async ({ page, deck }) => {
  await page.goto(deck.url);
  const addBtn = page.locator('#intents .add-card');
  await expect(addBtn).toContainText("Add intent");
  await addBtn.click();
  // a new authoring card appears with a Title input
  const authoring = page.locator("#intents .card .authoring").last();
  await expect(authoring).toBeVisible();
  // right after opening, the trailing draft is empty → button is "−" (discard)
  await expect(addBtn).toContainText("−");
  await authoring.locator("input.ainput").first().fill("My new intent");
  // once the draft has content it's committed → button returns to "+" (add next)
  await expect(addBtn).toContainText("+");
  // autosaved to answers.json with the added card
  await expect.poll(() => {
    const a = deck.readAnswers();
    return a && a.added && a.added.intents && a.added.intents.some((c) => c.title === "My new intent");
  }, { timeout: 5000 }).toBe(true);
});

test("empty added card is discarded when toggled off", async ({ page, deck }) => {
  await page.goto(deck.url);
  const addBtn = page.locator('#intents .add-card');
  await addBtn.click();
  await expect(page.locator("#intents .card .authoring")).toBeVisible();
  await addBtn.click(); // toggle off without typing
  await expect(page.locator("#intents .card .authoring")).toHaveCount(0);
});

test("strike a card marks it dismissed and drops it from the round", async ({ page, deck }) => {
  await page.goto(deck.url);
  const card = page.locator('#intents .card[data-id="i1"]');
  await card.locator(".icon-btn.drop").click();
  await expect(card).toHaveClass(/dismissed/);
  // answer something on the decision so Send is enabled, then send
  const dCard = page.locator('#decisions .card[data-id="d1"]');
  await dCard.locator(".qbtn").first().click();
  await page.locator("#sendRound").click();
  await expect.poll(() => {
    const evt = deck.stdoutLines.map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean).find((e) => e.action === "send-round");
    if (!evt) return "no-round";
    return evt.cards.some((c) => c.id === "i1") ? "i1-present" : "i1-gone";
  }, { timeout: 8000 }).toBe("i1-gone");
});

test("edit a step in place; edited step rides back with its draft", async ({ page, deck }) => {
  await page.goto(deck.url);
  const step = page.locator('#steps .card[data-id="step-0"]');
  await step.locator(".card-head").click(); // expand
  const desc = step.locator(".authoring textarea.ainput, .authoring input.ainput");
  // description field — find the textarea labelled Description
  const descBox = step.locator('.authoring .afield', { hasText: "Description" }).locator("textarea, input");
  await descBox.fill("EDITED step description");
  await expect.poll(() => {
    const a = deck.readAnswers();
    return a && a.added && a.added.steps && a.added.steps.some((s) => s.description === "EDITED step description");
  }, { timeout: 5000 }).toBe(true);
});

test("grill button sends a [GRILL REQUEST] ask", async ({ page, deck }) => {
  await page.goto(deck.url);
  const grill = page.locator("#grillIntents");
  await expect(grill).toBeVisible();
  await grill.click();
  await expect(page.locator("#grillIntentsState")).toContainText("sent");
  await expect.poll(() => {
    return deck.readQuestions().some((q) => (q.text || "").includes("[GRILL REQUEST]"));
  }, { timeout: 5000 }).toBe(true);
});

test("editable finish-line: add a verify row, send carries it", async ({ page, deck }) => {
  await page.goto(deck.url);
  await page.locator("#fvAddWrap .add-card").click();
  const rows = page.locator("#fvRows tr");
  await expect(rows).toHaveCount(2); // original + new
  // fill the new row's command
  const newRow = rows.last();
  await newRow.locator("input.fv-in").nth(1).fill("npm test");
  // answer the decision + send
  await page.locator('#decisions .card[data-id="d1"] .qbtn').first().click();
  await page.locator("#sendRound").click();
  await expect.poll(() => {
    const evt = deck.stdoutLines.map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean).find((e) => e.action === "send-round");
    if (!evt) return null;
    return (evt.finalVerify || []).some((v) => v.command === "npm test");
  }, { timeout: 8000 }).toBe(true);
});

test("finalize is never hard-blocked: a confirm guards early finalize, and it ships", async ({ page, deck }) => {
  await page.goto(deck.url);
  // d1 is a required (needs-you) card; leave it unanswered. Finalize must still
  // be clickable (not disabled) and pop a confirm naming what's unanswered.
  await expect(page.locator("#finalize")).toBeEnabled();
  let dialogMsg = "";
  page.on("dialog", (d) => { dialogMsg = d.message(); d.accept(); });
  await page.locator("#finalize").click();
  expect(dialogMsg).toMatch(/required card/);
  // confirming ships a finalize round
  await expect.poll(() => {
    return deck.stdoutLines.map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean).some((e) => e.action === "finalize");
  }, { timeout: 8000 }).toBe(true);
});

test("finalize with everything answered ships without a confirm", async ({ page, deck }) => {
  await page.goto(deck.url);
  // satisfy every required card: the decision and the intent (quick approve)
  await page.locator('#decisions .card[data-id="d1"] .qbtn').first().click();
  await page.locator('#intents .card[data-id="i1"] .qbtn').first().click();
  // no required cards or open questions remain → finalize should not confirm
  await expect(page.locator("#substatus")).toContainText("All clear");
  let dialogFired = false;
  page.on("dialog", (d) => { dialogFired = true; d.accept(); });
  await page.locator("#finalize").click();
  await expect.poll(() => {
    return deck.stdoutLines.map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean).some((e) => e.action === "finalize");
  }, { timeout: 8000 }).toBe(true);
  expect(dialogFired).toBe(false);
});

test("agent answer clears the open-question state (no lingering finalize nag)", async ({ page, deck }) => {
  await page.goto(deck.url);
  // ask a question on the decision card via its chat composer
  const card = page.locator('#decisions .card[data-id="d1"]');
  await card.locator(".card-head").click(); // expand
  await card.locator(".chat-input").fill("Why this fork?");
  await card.locator(".chat-send").click();
  // the ask is queued for the agent
  await expect.poll(() => deck.readQuestions().some((q) => q.cardId === "d1"), { timeout: 5000 }).toBe(true);
  // agent answers via the fast /answer path
  await page.request.post(deck.url + "answer", {
    data: { cardId: "d1", text: "Because A scales better." },
  });
  // the answer streams into the thread
  await expect(card.locator(".thread .who.agent")).toBeVisible({ timeout: 5000 });
  // and finalizing now reports NO open question in the confirm (only the
  // still-unanswered required card) — proving pendingAsk was cleared.
  let dialogMsg = "";
  page.on("dialog", (d) => { dialogMsg = d.message(); d.accept(); });
  await page.locator("#finalize").click();
  expect(dialogMsg).not.toMatch(/open question/);
});

test("steps are drag-reorderable; new order rides back in the round", async ({ page, deck }) => {
  await page.goto(deck.url);
  await expect(page.locator("#steps .card")).toHaveCount(2);
  // HTML5 drag-and-drop can't be driven by mouse moves in Chromium, so dispatch
  // the native drag events (sharing one DataTransfer) the deck's handlers expect.
  await page.evaluate(() => {
    const steps = document.getElementById("steps");
    const src = steps.querySelector('.card[data-id="step-1"]');
    const tgt = steps.querySelector('.card[data-id="step-0"]');
    const dt = new DataTransfer();
    const fire = (el, type, extra = {}) => {
      const ev = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt, ...extra });
      el.dispatchEvent(ev);
    };
    // grip mousedown arms draggable, then the drag sequence
    src.querySelector(".grip").dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    fire(src, "dragstart");
    const r = tgt.getBoundingClientRect();
    fire(steps, "dragover", { clientY: r.top + 2, clientX: r.left + 2 });
    fire(src, "dragend");
  });
  // answer the decision so the round is non-empty, then send
  await page.locator('#decisions .card[data-id="d1"] .qbtn').first().click();
  await page.locator("#sendRound").click();
  await expect.poll(() => {
    const evt = deck.stdoutLines.map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean).find((e) => e.action === "send-round");
    if (!evt) return null;
    const s0 = evt.cards.find((c) => c.id === "step-0");
    const s1 = evt.cards.find((c) => c.id === "step-1");
    if (!s0 || !s1) return null;
    return s1.priority < s0.priority; // step-1 now ahead of step-0
  }, { timeout: 8000 }).toBe(true);
});

test("live SSE: editing plan.json updates the open deck in place", async ({ page, deck }) => {
  await page.goto(deck.url);
  await expect(page.locator("#title")).toHaveText("E2E plan");
  const plan = deck.readPlan();
  plan.rev = (plan.rev || 0) + 1;
  plan.title = "Live-updated title";
  deck.writePlan(plan);
  await expect(page.locator("#title")).toHaveText("Live-updated title", { timeout: 8000 });
});
