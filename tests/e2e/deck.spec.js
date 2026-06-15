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

test("live SSE: editing plan.json updates the open deck in place", async ({ page, deck }) => {
  await page.goto(deck.url);
  await expect(page.locator("#title")).toHaveText("E2E plan");
  const plan = deck.readPlan();
  plan.rev = (plan.rev || 0) + 1;
  plan.title = "Live-updated title";
  deck.writePlan(plan);
  await expect(page.locator("#title")).toHaveText("Live-updated title", { timeout: 8000 });
});
