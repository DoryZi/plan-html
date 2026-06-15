// Section rendering: rebuilds the whole deck from the current PLAN + user state.
// Owns the "+ Add" authoring buttons (a toggle that opens/discards a blank draft)
// and drag-to-reorder. Exposes renderSections (called on load and on every live
// reconcile), plus refreshAddBtns and setupDrag used elsewhere.
//
// createSections(app) closes over the shared context and returns the wiring.
// renderSections is also stored back on `app` so cards/persist can trigger a
// full rebuild without a circular import.

import { buildCard } from "./cards.js";
import { titleOf } from "./state.js";

export const createSections = (app) => {
  const { store, el, zoomableDiagram, md, persist, refreshAll } = app;

  // ---------- add cards: blank, editable, user-authored ----------
  // monotonic-ish unique id without Date.now() noise concerns
  let addSeq = 0;
  const newId = (kind) => `user-${kind}-${++addSeq}-${Math.floor(performance.now())}`;
  const blankCard = (kind) => {
    const base = { id: newId(kind), userAdded: true, title: "", thread: [] };
    if (kind === "decision") { base.status = "needs-you"; base.options = []; }
    if (kind === "step") base.kind = "step";
    return base;
  };
  // an added card the user hasn't typed anything into yet — safe to discard
  const isEmptyDraft = (c) => {
    if ((c.title || "").trim()) return false;
    const fields = ["intent", "boundary", "building", "summary",
                    "description", "files", "test"];
    if (fields.some((f) => (c[f] || "").trim())) return false;
    if ((c.options || []).length) return false;
    const v = c.verify;
    if (v && (v.method || v.command || v.expected)) return false;
    return true;
  };
  // add buttons register here so their +/− label can flip live as the trailing
  // blank card gains/loses content (typing doesn't re-render the section)
  const syncAddBtn = (rec) => {
    const arr = store.added[rec.bucket];
    const trailing = arr[arr.length - 1];
    const openBlank = trailing && isEmptyDraft(trailing);
    rec.el.textContent = `${openBlank ? "−" : "+"} Add ${rec.label}`;
    rec.el.classList.toggle("active", Boolean(openBlank));
    rec.openBlank = openBlank;
  };
  const refreshAddBtns = () => store.addBtns.forEach(syncAddBtn);
  // "+ Add" button: a TOGGLE. Click + → open a blank authoring card. Click −
  // → collapse it, discarding the draft only if it's still empty (typed cards
  // stay). Prevents piling up empty cards.
  const addBtn = (kind, bucket, container, label) => {
    const b = el("button", "add-card");
    b.type = "button";
    const rec = { el: b, bucket, label, openBlank: false };
    store.addBtns.push(rec);
    syncAddBtn(rec);
    b.addEventListener("click", () => {
      const arr = store.added[bucket];
      if (rec.openBlank) {
        // collapse: drop the trailing empty draft
        arr.pop();
        persist();
        renderSections();
        return;
      }
      const card = blankCard(kind);
      arr.push(card);
      persist();
      renderSections();
      const node = document.querySelector(`.card[data-id="${card.id}"]`);
      if (node) {
        node.classList.add("open");
        node.scrollIntoView({ behavior: "smooth", block: "center" });
        const t = node.querySelector(".authoring .ainput");
        if (t) t.focus();
      }
    });
    container.appendChild(b);
  };

  // ---------- drag-to-reorder: priority order, per section, persisted ----------
  // answers[id].order is the user's priority index within its section; cards
  // sort by it on load and the order rides back to the agent with the round.
  const DRAG_CONTAINERS = ["intents", "mockDecisions", "decisions"];
  let dragging = null;
  const applySavedOrder = (cid) => {
    const c = document.getElementById(cid);
    if (!c) return;
    [...c.children]
      .sort((a, b) => {
        const oa = (store.answers[a.dataset.id] || {}).order;
        const ob = (store.answers[b.dataset.id] || {}).order;
        return (oa ?? 1e9) - (ob ?? 1e9);
      })
      .forEach((e) => c.appendChild(e));
  };
  const saveOrder = (cid) => {
    const c = document.getElementById(cid);
    [...c.children].forEach((e, idx) => { store.ans(e.dataset.id).order = idx; });
    persist();
  };
  const setupDrag = (cid) => {
    const c = document.getElementById(cid);
    if (!c) return;
    applySavedOrder(cid);
    c.querySelectorAll(".card").forEach((card) => {
      const grip = card.querySelector(".grip");
      if (!grip) return;
      grip.addEventListener("mousedown", () => { card.draggable = true; });
      card.addEventListener("dragstart", (e) => {
        dragging = card; card.classList.add("drag");
        e.dataTransfer.effectAllowed = "move";
      });
      card.addEventListener("dragend", () => {
        card.classList.remove("drag"); card.draggable = false; dragging = null;
        saveOrder(cid);
      });
    });
    if (c.dataset.dndBound) return;   // attach the container listener only once
    c.dataset.dndBound = "1";
    c.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (!dragging || dragging.parentElement !== c) return;
      const after = [...c.querySelectorAll(".card:not(.drag)")].find((card) => {
        const r = card.getBoundingClientRect();
        return e.clientY < r.top + r.height / 2;
      });
      if (after) c.insertBefore(dragging, after);
      else c.appendChild(dragging);
    });
  };

  // ---------- (re)render everything from the current PLAN ----------
  // Wrapped in a function so a live SSE `plan-updated` can rebuild in place.
  // The user's inputs live in `answers` (untouched here), so picks/typed text
  // survive a rebuild; open-state + scroll are captured/restored by reconcile().
  const SECTION_IDS = ["boundaries", "intents", "mockDecisions", "decisions",
                       "steps", "fvRows"];
  const renderSections = () => {
    const PLAN = store.plan;
    store.cards.length = 0;
    store.addBtns.length = 0;
    SECTION_IDS.forEach((id) => { const e = document.getElementById(id); if (e) e.innerHTML = ""; });

    // ---------- render header ----------
    document.getElementById("title").textContent = PLAN.title || "Plan";
    document.getElementById("metaline").textContent =
      [PLAN.date, "round " + store.round, PLAN.task].filter(Boolean).join(" · ");
    const summaryEl = document.getElementById("summary");
    summaryEl.innerHTML = PLAN.summary ? md(PLAN.summary) : "";
    // gradual reveal: clamp a long lead behind a "read more" so it doesn't dominate the fold
    if (PLAN.summary) {
      const moreBtn = el("button", "lead-more");
      moreBtn.type = "button";
      summaryEl.after(moreBtn);
      summaryEl.classList.add("clampable");
      requestAnimationFrame(() => {
        // overflows the clamp height? then offer expand; otherwise un-clamp (it fits)
        if (summaryEl.scrollHeight > summaryEl.clientHeight + 8) {
          moreBtn.classList.add("show");
          moreBtn.textContent = "Read the full summary ▾";
          moreBtn.onclick = () => {
            const open = summaryEl.classList.toggle("open");
            moreBtn.textContent = open ? "Show less ▴" : "Read the full summary ▾";
          };
        } else {
          summaryEl.classList.remove("clampable");
        }
      });
    }
    document.getElementById("goalBox").classList.toggle("show", Boolean(PLAN.goal));
    if (PLAN.goal) document.getElementById("goalText").innerHTML = md(PLAN.goal);
    document.getElementById("followupBanner").classList.toggle("show", Boolean(PLAN.followUp));
    document.getElementById("finalize").textContent =
      PLAN.followUp ? "Resume build ▶" : "Finalize plan";

    // ---------- render sections ----------
    // each section merges the agent's cards with the user's added cards, and
    // always shows (so its "+ Add" button is reachable even when empty).
    const boundaries = [...(PLAN.boundaries || []), ...store.added.boundaries];
    document.getElementById("boundariesWrap").style.display = "";
    boundaries.forEach((d, i) =>
      buildCard(app, d, i, "boundary", document.getElementById("boundaries")));
    addBtn("boundary", "boundaries", document.getElementById("boundaries"), "boundary");

    const intents = [...(PLAN.intents || []), ...store.added.intents];
    document.getElementById("intentsWrap").style.display = "";
    intents.forEach((d, i) =>
      buildCard(app, d, i, "intent", document.getElementById("intents")));
    addBtn("intent", "intents", document.getElementById("intents"), "intent");

    // decisions with mock options get their own prominent section — for UI work
    // the mock IS the decision, it must not hide in the generic list. User-added
    // decisions are plain (no mocks), so they join the plain-decisions list.
    const isMockDecision = (d) => (d.options || []).some((o) =>
      o && typeof o === "object" && (o.svg || o.html));
    const mockDecisions = (PLAN.decisions || []).filter(isMockDecision);
    const plainDecisions = [...(PLAN.decisions || []).filter((d) => !isMockDecision(d)),
                            ...store.added.decisions];
    if (mockDecisions.length) {
      document.getElementById("mocksWrap").style.display = "";
      mockDecisions.forEach((d, i) =>
        buildCard(app, d, i, "decision", document.getElementById("mockDecisions")));
    } else {
      document.getElementById("mocksWrap").style.display = "none";
    }
    document.getElementById("decisionsWrap").style.display = "";
    plainDecisions.forEach((d, i) =>
      buildCard(app, d, i, "decision", document.getElementById("decisions")));
    addBtn("decision", "decisions", document.getElementById("decisions"), "decision");

    DRAG_CONTAINERS.forEach(setupDrag);

    document.getElementById("diagramWrap").style.display = PLAN.diagramSvg ? "" : "none";
    if (PLAN.diagramSvg) {
      const dg = document.getElementById("diagram");
      dg.innerHTML =
        `<svg viewBox="${PLAN.diagramViewBox || '0 0 720 240'}" role="img" aria-label="plan diagram">
         <defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7"
           markerHeight="7" orient="auto-start-reverse">
           <path d="M0,0 L10,5 L0,10 z" fill="#9aa3b2"/></marker></defs>
         ${PLAN.diagramSvg}</svg>`;
      zoomableDiagram(dg, "Architecture & flow");
    }
    // steps: every step — agent's or user-added — renders as an editable card,
    // so the user can rewrite or delete (✕) any of them. The section always
    // shows so its "+ Add step" is reachable. Agent steps get a stable id if
    // they lack one (so strike/edit state keys correctly).
    document.getElementById("stepsWrap").style.display = "";
    const stepsWrap = document.getElementById("steps");
    (PLAN.steps || []).forEach((s, i) => { if (!s.id) s.id = `step-${i}`; s.kind = "step"; });
    // walk PLAN.steps in order, swapping each edited original for its editable
    // copy (so an edited step keeps its position, not jumps to the end). Steps
    // the user added from scratch (not derived from a PLAN step) append after.
    const editedById = {};
    const fromPlan = new Set((PLAN.steps || []).map((s) => s.id));
    store.added.steps.forEach((s) => { if (fromPlan.has(s.id)) editedById[s.id] = s; });
    const steps = [
      ...(PLAN.steps || []).map((s) => editedById[s.id] || s),
      ...store.added.steps.filter((s) => !fromPlan.has(s.id)),
    ];
    steps.forEach((s, i) => buildCard(app, s, i, "step", stepsWrap));
    addBtn("step", "steps", stepsWrap, "step");
    // ---------- final verify ("finish line") — editable rows ----------
    // The section always shows so its "+ Add verify row" is reachable. fvState
    // is the editable working copy; first render seeds it from PLAN.finalVerify.
    if (store.fvState === null) {
      store.fvState = (PLAN.finalVerify || []).map((v) => ({ ...v }));
    }
    document.getElementById("finalVerifyWrap").style.display = "";
    const tb = document.getElementById("fvRows");
    // intent options for the dropdown (existing + user-added intents)
    const intentOpts = [...(PLAN.intents || []), ...store.added.intents];
    const fvInput = (val, cls, onInput, placeholder) => {
      const inp = el("input"); inp.type = "text";
      inp.className = "ainput fv-in" + (cls ? " " + cls : "");
      inp.value = val || ""; inp.placeholder = placeholder || "";
      inp.addEventListener("input", () => { onInput(inp.value); persist(); });
      return inp;
    };
    store.fvState.forEach((v, ri) => {
      const tr = el("tr");
      // intent cell — dropdown of intents, plus free entry fallback
      const itd = el("td");
      const sel = el("select"); sel.className = "ainput fv-in";
      const blank = el("option", null, "— intent —"); blank.value = ""; sel.appendChild(blank);
      intentOpts.forEach((it) => {
        const o = el("option", null, titleOf(it)); o.value = it.id; sel.appendChild(o);
      });
      // if the row's intent isn't a known id, keep it as a literal option
      if (v.intent && !intentOpts.some((it) => it.id === v.intent)) {
        const o = el("option", null, v.intent); o.value = v.intent; sel.appendChild(o);
      }
      sel.value = v.intent || "";
      sel.addEventListener("change", () => { v.intent = sel.value; persist(); });
      itd.appendChild(sel); tr.appendChild(itd);
      // method / command / expected — editable
      const mtd = el("td"); mtd.appendChild(fvInput(v.method, null, (x) => v.method = x, "e2e / unit")); tr.appendChild(mtd);
      const ctd = el("td"); ctd.appendChild(fvInput(v.command, "cmd", (x) => v.command = x, "exact command")); tr.appendChild(ctd);
      const etd = el("td"); etd.appendChild(fvInput(v.expected, null, (x) => v.expected = x, "observable result")); tr.appendChild(etd);
      // delete row
      const dtd = el("td", "fv-del-cell");
      const del = el("button", "icon-btn drop", "✕");
      del.type = "button"; del.title = "Delete this verify row";
      del.addEventListener("click", () => { store.fvState.splice(ri, 1); persist(); renderSections(); });
      dtd.appendChild(del); tr.appendChild(dtd);
      tb.appendChild(tr);
    });
    // "+ Add verify row"
    const addRow = el("button", "add-card", "+ Add verify row");
    addRow.type = "button";
    addRow.addEventListener("click", () => {
      store.fvState.push({ intent: "", method: "", command: "", expected: "" });
      persist(); renderSections();
      const rows = tb.querySelectorAll("tr");
      const last = rows[rows.length - 1];
      if (last) {
        last.scrollIntoView({ behavior: "smooth", block: "center" });
        const f = last.querySelector("select"); if (f) f.focus();
      }
    });
    document.getElementById("fvAddWrap").innerHTML = "";
    document.getElementById("fvAddWrap").appendChild(addRow);
    DRAG_CONTAINERS.forEach(setupDrag);
    refreshAll();
  };  // end renderSections

  // expose for cross-module triggers (persist flips add buttons; live reconcile rebuilds)
  app.renderSections = renderSections;
  app.refreshAddBtns = refreshAddBtns;
  return { renderSections, refreshAddBtns, setupDrag };
};
