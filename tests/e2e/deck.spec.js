import { test, expect } from "./fixtures.js";

// Reference sections (steps, finish line, discovered) start folded: open one from its heading.
const openSection = async (page, id) => {
  const wrap = page.locator(`#${id}`);
  if (await wrap.evaluate((el) => el.classList.contains("sec-closed"))) await wrap.locator("> h2 .sec-toggle").click();
};
// The agent box of a card opens from its "Ask the agent" button.
const openChat = (card) => card.locator(".card-tools button", { hasText: "Ask the agent" }).click();

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
  await openSection(page, "stepsWrap");
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

test("interview popup asks one question at a time and lands answers on the plan", async ({ page, deck }) => {
  await page.goto(deck.url);
  const ivBtn = page.locator("#grillPlan");
  await expect(ivBtn).toBeHidden(); // the interview opens from the row under the goal
  await page.locator("#topRow button", { hasText: "Interview me" }).click();
  await expect(ivBtn).toBeVisible();
  await ivBtn.click();
  await expect(page.locator("#ivOverlay")).toBeVisible();

  // the click queued [INTERVIEW START] for the agent
  await expect.poll(() => {
    return deck.readQuestions().some((q) => (q.text || "").includes("[INTERVIEW START]"));
  }, { timeout: 5000 }).toBe(true);

  // simulate the agent asking the first question
  const plan = deck.readPlan();
  plan.rev = (plan.rev || 0) + 1;
  plan.interview = { state: "asking", max: 8, turns: [], next: { id: "iv-1", q: "What are you building?" } };
  deck.writePlan(plan);

  await expect(page.locator("#ivQ")).toContainText("What are you building?", { timeout: 8000 });
  await page.locator("#ivA").fill("A tool that tracks weekly spend against a budget.");
  await page.locator("#ivNext").click();

  // the answer rides back to the agent under the question's id
  await expect.poll(() => {
    return deck.readQuestions().some((q) => q.id === "iv-1" && (q.text || "").includes("weekly spend"));
  }, { timeout: 5000 }).toBe(true);

  // simulate the agent wrapping up the interview
  const plan2 = deck.readPlan();
  plan2.rev = (plan2.rev || 0) + 1;
  plan2.interview = {
    state: "done", max: 8,
    turns: [{ id: "iv-1", q: "What are you building?", a: "A tool that tracks weekly spend against a budget." }],
    next: null,
  };
  deck.writePlan(plan2);

  await expect(page.locator("#ivOverlay")).toBeHidden({ timeout: 8000 });
  await expect(page.locator("#grillPlanState")).toContainText("Interview done: 1 answer");
});

test("editable finish-line: add a verify row, send carries it", async ({ page, deck }) => {
  await page.goto(deck.url);
  await openSection(page, "finalVerifyWrap");
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
  await expect(card.locator(".chat-input")).toBeHidden(); // the agent box opens on demand
  await openChat(card);
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
  await openSection(page, "stepsWrap");
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
  // the visible "Step N —" numbers renumber to match the new DOM order
  await expect(page.locator('#steps .card[data-id="step-1"] .card-title .t')).toContainText("Step 1 —");
  await expect(page.locator('#steps .card[data-id="step-0"] .card-title .t')).toContainText("Step 2 —");
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

test("agent answer written to the plan survives a reconnect (durable, not just SSE)", async ({ page, deck }) => {
  // ask a question on a card
  await page.goto(deck.url);
  const card = page.locator('#decisions .card[data-id="d1"]');
  await card.locator(".card-head").click();
  await openChat(card);
  await card.locator(".chat-input").fill("Why this fork?");
  await card.locator(".chat-send").click();
  await expect.poll(() => deck.readQuestions().some((q) => q.cardId === "d1"), { timeout: 5000 }).toBe(true);
  // agent answers DURABLY: write the Q&A into the card's thread in the plan and
  // bump rev (the protocol's reliable path — NOT the ephemeral /answer push).
  const plan = deck.readPlan();
  const d = plan.decisions.find((x) => x.id === "d1");
  d.thread = [
    { role: "user", text: "Why this fork?" },
    { role: "agent", text: "Because option A scales better for this case." },
  ];
  plan.rev = (plan.rev || 0) + 1;
  deck.writePlan(plan);
  // simulate a dropped-then-reconnected stream: reload the page fresh. On load
  // the server re-sends the full plan, so the answer must still be there.
  await page.reload();
  const reloaded = page.locator('#decisions .card[data-id="d1"]');
  await reloaded.locator(".card-head").click();
  await expect(reloaded.locator(".thread .who.agent")).toBeVisible({ timeout: 5000 });
  await expect(reloaded.locator(".thread")).toContainText("scales better");
});

test("poll fallback: deck still updates when SSE never connects (buffering tunnel)", async ({ page, deck }) => {
  // Simulate a proxy that buffers/blocks text/event-stream (e.g. a Cloudflare
  // quick-tunnel): kill /events so SSE delivers nothing. The deck must fall
  // back to polling GET /plan and still reconcile.
  await page.route("**/events", (route) => route.abort());
  await page.goto(deck.url);
  await expect(page.locator("#title")).toHaveText("E2E plan");
  // edit the plan as the agent would when answering
  const plan = deck.readPlan();
  plan.rev = (plan.rev || 0) + 1;
  plan.title = "Updated via polling";
  deck.writePlan(plan);
  // no SSE — only the GET /plan poll can deliver this (idle interval ~4s)
  await expect(page.locator("#title")).toHaveText("Updated via polling", { timeout: 12000 });
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

test("show what's left collapses fully-hidden sections, and restores them", async ({ page, deck }) => {
  await page.goto(deck.url);
  // Answer the only decision. Steps never count as open to-dos, so now the
  // steps + decisions sections hold nothing awaiting the user, while the
  // intent card is still open.
  await page.locator('#decisions .card[data-id="d1"] .qbtn').first().click();
  const toggle = page.locator("#leftToggle");
  await expect(toggle).toBeVisible(); // always in the dock

  await toggle.click();
  // Regression: sections whose every card is hidden must drop their heading and
  // add-row too. `.section.all-done` never matched anything, so these headers
  // used to stay on screen and the filter looked like it did nothing.
  await expect(page.locator("#stepsWrap")).toHaveClass(/all-hidden/);
  await expect(page.locator("#decisionsWrap")).toHaveClass(/all-hidden/);
  await expect(page.locator("#stepsWrap h2")).toBeHidden();
  // the section that still has an open card stays put
  await expect(page.locator("#intentsWrap")).not.toHaveClass(/all-hidden/);
  await expect(page.locator('#intents .card[data-id="i1"]')).toBeVisible();

  // Negative case: turning the filter off restores every section.
  await toggle.click();
  await expect(page.locator("#stepsWrap")).not.toHaveClass(/all-hidden/);
  await expect(page.locator("#decisionsWrap")).not.toHaveClass(/all-hidden/);
  await expect(page.locator("#stepsWrap h2")).toBeVisible();
});

test("card Q&A threads ride back with the round (the reasoning, not just the pick)", async ({ page, deck }) => {
  await page.goto(deck.url);
  // The agent answered a question on this card in a previous exchange.
  const plan = deck.readPlan();
  plan.rev = (plan.rev || 0) + 1;
  plan.decisions[0].thread = [
    { role: "user", text: "why option A?" },
    { role: "agent", text: "because B needs a lock we cannot enforce" },
  ];
  deck.writePlan(plan);
  // Wait for the live reconcile to actually land the thread in the DOM before
  // interacting — the card was already rendered pre-write, so its mere
  // presence proves nothing about the reconcile having happened yet.
  await expect(page.locator('#decisions .card[data-id="d1"] .thread .msg')).toHaveCount(2, { timeout: 8000 });

  await page.locator('#decisions .card[data-id="d1"] .qbtn').first().click();
  await page.locator("#sendRound").click();

  const thread = await expect.poll(() => {
    const evt = deck.stdoutLines.map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean).find((e) => e.action === "send-round");
    if (!evt) return null;
    return (evt.cards.find((c) => c.id === "d1") || {}).thread || null;
  }, { timeout: 8000 }).not.toBeNull();

  const evt = deck.stdoutLines.map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean).find((e) => e.action === "send-round");
  const d1 = evt.cards.find((c) => c.id === "d1");
  expect(d1.thread).toHaveLength(2);
  expect(d1.thread[1].text).toContain("lock we cannot enforce");
  // negative case: a card with no discussion carries no thread key at all
  const i1 = evt.cards.find((c) => c.id === "i1");
  expect(i1.thread).toBeUndefined();
});

test("markdown tables render as real tables, not raw pipes", async ({ page, deck }) => {
  const plan = deck.readPlan();
  plan.rev = (plan.rev || 0) + 1;
  plan.decisions[0].building =
    "Intro line.\n\n| Harness | Tier | Note |\n|---|---|---|\n" +
    "| **Claude** | 2 | uses `hooks` |\n| Cursor | 0 | tail only |\n\nTrailing line.";
  deck.writePlan(plan);
  await page.goto(deck.url);

  const card = page.locator('#decisions .card[data-id="d1"]');
  await card.click();
  const table = card.locator(".md table").first();
  await expect(table).toBeVisible();
  await expect(table.locator("thead th")).toHaveCount(3);
  await expect(table.locator("tbody tr")).toHaveCount(2);
  // inline markdown survives inside cells
  await expect(table.locator("tbody tr").first().locator("strong")).toHaveText("Claude");
  await expect(table.locator("tbody tr").first().locator("code")).toHaveText("hooks");
  // and the raw pipe syntax is gone from the rendered text
  await expect(card.locator(".md").first()).not.toContainText("|---|");

  // negative case: a lone pipe line without a delimiter row stays plain text
  const plan2 = deck.readPlan();
  plan2.rev = (plan2.rev || 0) + 1;
  plan2.decisions[0].building = "not a table | just a pipe in prose";
  deck.writePlan(plan2);
  await expect.poll(async () => card.locator(".md table").count(), { timeout: 8000 }).toBe(0);
});

test("discovered section is hidden when empty, shown with the finding when present", async ({ page, deck }) => {
  await page.goto(deck.url);
  await expect(page.locator("#discoveredWrap")).toBeHidden();

  const plan = deck.readPlan();
  plan.rev = (plan.rev || 0) + 1;
  plan.discovered = [
    {
      id: "disc-1",
      title: "There's already a rate limiter",
      finding: "middleware/throttle.py already limits per user.",
      impact: "Reuse it instead of adding a new one.",
      source: "middleware/throttle.py",
    },
  ];
  deck.writePlan(plan);
  await expect(page.locator("#discoveredWrap")).toBeVisible();
  const card = page.locator('#discovered .card[data-id="disc-1"]');
  await expect(card).toHaveCount(1);
  await openSection(page, "discoveredWrap");
  await card.click();
  await expect(card).toContainText("middleware/throttle.py already limits per user");
  await expect(card).toContainText("Reuse it instead of adding a new one");
  // read-only: no approve/reject/your-call buttons, unlike every other card kind
  await expect(card.locator(".qbtn")).toHaveCount(0);
});

test("discovered cards never gate finalize and ride back in the round with their finding", async ({ page, deck }) => {
  const plan = deck.readPlan();
  plan.discovered = [{ id: "disc-1", title: "Found it", finding: "Some existing code already does this." }];
  deck.writePlan(plan);
  await page.goto(deck.url);
  await expect(page.locator('#discovered .card[data-id="disc-1"]')).toHaveCount(1);

  // satisfy the one required card and intent so finalize ships without a confirm
  await page.locator('#decisions .card[data-id="d1"] .qbtn').first().click();
  await page.locator('#intents .card[data-id="i1"] .qbtn').first().click();
  let dialogFired = false;
  page.on("dialog", (d) => { dialogFired = true; d.accept(); });
  await page.locator("#finalize").click();
  await expect.poll(() => {
    return deck.stdoutLines.map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean).some((e) => e.action === "finalize");
  }, { timeout: 8000 }).toBe(true);
  expect(dialogFired).toBe(false);

  const evt = deck.stdoutLines.map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean).find((e) => e.action === "finalize");
  const disc = evt.cards.find((c) => c.id === "disc-1");
  expect(disc.kind).toBe("discovered");
  expect(disc.draft.finding).toContain("existing code already does this");
});

test("fix deck: card images from files/, a bulk Fix all button, empty sections hidden", async ({ page, deck }) => {
  const { mkdirSync, writeFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  mkdirSync(join(deck.dir, "files"));
  writeFileSync(join(deck.dir, "files", "shot.png"), Buffer.from(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082", "hex"));
  const opts = ["Fix now", "Next cycle", "Drop"];
  deck.writePlan({
    title: "Fix cycle", slug: "fix", round: 1, rev: 5, hideEmpty: true, goal: "Pick what gets fixed now",
    bulk: [{ label: "Fix all", choice: "Fix now" }], intents: [], steps: [], finalVerify: [],
    decisions: [
      { id: "item-1", title: "Chip wraps", status: "needs-you", summary: "Broken", building: "![Chip](files/shot.png)", options: opts },
      { id: "item-2", title: "Logo hidden", status: "needs-you", summary: "Polish", building: "no ![x](files/../plan.json) here", options: opts },
    ],
  });
  await page.goto(deck.url);
  await expect(page.locator("#title")).toHaveText("Fix cycle");
  await page.locator("#expandAll").click();
  const img = page.locator("#decisions img.md-img");
  await expect(img).toHaveCount(1);
  await expect.poll(() => img.evaluate((i) => i.naturalWidth)).toBe(1);
  await expect(page.locator("#intentsWrap")).toBeHidden();
  await expect(page.locator("#stepsWrap")).toBeHidden();
  await expect(page.locator("#finalVerifyWrap")).toBeHidden();
  await page.getByRole("button", { name: "Fix all (2)" }).click();
  // the cards already drawn show the pick at once, not only after a reload
  await expect(page.locator("#decisions .card .opt.sel", { hasText: "Fix now" })).toHaveCount(2);
  await expect.poll(() => {
    const a = deck.readAnswers();
    const pick = (id) => (a && a.answers && a.answers[id] ? a.answers[id].choice : null);
    return [pick("item-1"), pick("item-2")].join(",");
  }, { timeout: 5000 }).toBe("Fix now,Fix now");
});

test("markdown images and links cannot break out of their attributes", async ({ page, deck }) => {
  const { mkdirSync, writeFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  mkdirSync(join(deck.dir, "files"));
  writeFileSync(join(deck.dir, "files", "shot.png"), Buffer.from(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082", "hex"));
  deck.writePlan({
    title: "Escapes", slug: "esc", round: 1, rev: 7, hideEmpty: true, goal: "x", intents: [], steps: [], finalVerify: [],
    decisions: [{ id: "d1", title: "Quotes", status: "needs-you", summary: "s", options: ["A"],
      building: '![x" onerror="window.__pwned=1](files/shot.png) and [link](https://example.com/"onmouseover="window.__pwned2=1)' }],
  });
  await page.goto(deck.url);
  await page.locator("#expandAll").click();
  const img = page.locator("#decisions img.md-img");
  await expect(img).toHaveCount(1);
  await expect(img).toHaveAttribute("alt", 'x" onerror="window.__pwned=1');
  expect(await img.getAttribute("onerror")).toBeNull();
  await expect(page.locator("#decisions a[onmouseover]")).toHaveCount(0);
  expect(await page.evaluate(() => [window.__pwned, window.__pwned2])).toEqual([null, null].map(() => undefined));
});
