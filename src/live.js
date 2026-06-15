// Live wiring: the progress/submit bar, the next-round agent-actions panel,
// shipping a round (/submit), and live mode — SSE reconcile, the window.__askNow
// chat hook (/ask) and the "interview me" grill trigger.
//
// createLive(app) closes over the shared context and wires the bar, the global
// controls and (in --live mode) the EventSource stream. It also installs
// app.refreshBar / app.refreshAll so cards and sections can refresh the bar.

import { buildPayload } from "./payload.js";

export const createLive = (app) => {
  const { store, el, mdEl } = app;

  // follow-up rounds: settled intents/boundaries are locked and must not
  // re-gate Resume — only explicitly needs-you cards do
  const needsYouCards = () => store.cards.filter((c) =>
    store.plan.followUp
      ? c.data.status === "needs-you"
      : c.kind === "intent" || c.kind === "boundary" || c.data.status === "needs-you");

  const refreshBar = () => {
    const total = store.cards.length;
    const answered = store.cards.filter((c) => store.satisfied(c.id)).length;
    const questions = store.cards.filter((c) => store.hasQuestion(c.id)).length;
    const pct = total ? Math.round((answered / total) * 100) : 100;
    document.getElementById("progfill").style.width = pct + "%";
    document.getElementById("progtxt").textContent =
      `${answered} / ${total} cards answered` +
      (questions ? ` · ${questions} question${questions > 1 ? "s" : ""} for the agent` : "");

    const anyInput = store.cards.some((c) => store.hasInput(c.id)) ||
      store.agentActions.reexplore || store.agentActions.note.trim() !== "";
    const blockers = needsYouCards().filter((c) => !store.satisfied(c.id));
    document.getElementById("sendRound").disabled = !anyInput;
    document.getElementById("finalize").disabled = blockers.length > 0 || questions > 0;
    document.getElementById("substatus").textContent =
      questions ? `💬 ${questions} open question${questions > 1 ? "s" : ""} — send a round to get the answers`
      : blockers.length ? `🏁 ${blockers.length} required card${blockers.length > 1 ? "s" : ""} to go before Finalize unlocks (buttons or your own words)`
      : "🏁 All clear — Finalize is the move unless something still nags. Another round is one click away.";

    // "Show what's left" — only worth offering once a few cards are done.
    // While the filter is on, label it with how many remain so it doubles as a counter.
    const left = total - answered;
    const toggle = document.getElementById("leftToggle");
    toggle.classList.toggle("show", answered >= 3 && left > 0);
    const filtering = document.body.classList.contains("hide-done");
    toggle.classList.toggle("on", filtering);
    toggle.textContent = filtering ? `Showing ${left} left · show all` : "Show what's left";
    // if filtering emptied everything (all done), drop back to show-all so the
    // deck never looks blank
    if (filtering && left === 0) { document.body.classList.remove("hide-done"); }
  };
  const refreshAll = () => { store.cards.forEach((c) => c.refresh()); refreshBar(); };
  // publish so cards.touched() and sections.renderSections() can refresh
  app.refreshBar = refreshBar;
  app.refreshAll = refreshAll;

  document.getElementById("leftToggle").addEventListener("click", () => {
    document.body.classList.toggle("hide-done");
    refreshBar();
  });

  document.getElementById("expandAll").addEventListener("click", () => {
    const cardEls = document.querySelectorAll(".card");
    const anyClosed = [...cardEls].some((c) => !c.classList.contains("open"));
    cardEls.forEach((c) => c.classList.toggle("open", anyClosed));
    document.getElementById("expandAll").textContent = anyClosed ? "Collapse all" : "Expand all";
  });

  // --- next-round agent actions panel ---
  const reexploreBtn = document.getElementById("reexplore");
  const agentNoteTa = document.getElementById("agentNote");
  reexploreBtn.classList.toggle("sel", store.agentActions.reexplore);
  agentNoteTa.value = store.agentActions.note || "";
  reexploreBtn.addEventListener("click", () => {
    store.agentActions.reexplore = !store.agentActions.reexplore;
    reexploreBtn.classList.toggle("sel", store.agentActions.reexplore);
    app.touched();
  });
  agentNoteTa.addEventListener("input", () => {
    store.agentActions.note = agentNoteTa.value;
    app.touched();
  });

  const payload = (action) => {
    // emit cards in the user's current on-screen priority order (top = highest)
    const domOrder = [...document.querySelectorAll(".card")].map((e) => e.dataset.id);
    return buildPayload(store, action, domOrder);
  };

  const saveEl = () => document.getElementById("savestate");
  const ship = async (action) => {
    const send = document.getElementById("sendRound");
    const fin = document.getElementById("finalize");
    send.disabled = true; fin.disabled = true;
    const btn = action === "finalize" ? fin : send;
    const btnLabel = btn.textContent;
    btn.textContent = "Sending…";
    let delivered = false;
    try {
      const r = await fetch("/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload(action)),
      });
      delivered = r.ok;
    } catch (e) { delivered = false; }
    if (!delivered) {
      // the server is gone (likely timed out) — do NOT pretend it was sent;
      // answers are safe in localStorage + the last autosave
      btn.textContent = btnLabel;
      send.disabled = false; fin.disabled = false;
      refreshBar();
      document.getElementById("substatus").textContent =
        "⚠ Could not reach the agent — the deck server may have expired. "
        + "Your answers are saved; re-run the deck from the terminal and they will reload.";
      saveEl().textContent = "Saved locally only"; saveEl().className = "savestate warn";
      return;
    }
    // sent successfully — show the done page FIRST so there is always a clear
    // confirmation, then attempt to close the tab. window.close() only works on
    // script-opened tabs (it is a silent no-op on a tab the user opened by URL,
    // e.g. over the tunnel on a phone) — so the done page is the real signal,
    // not the close.
    document.getElementById("wrap")
      .querySelectorAll("header,.lead,.lead-more,.followup,.goal,.howto-d,.progress,#boundariesWrap,#intentsWrap,#mocksWrap,#decisionsWrap,#diagramWrap,#stepsWrap,#finalVerifyWrap,#nextRoundWrap")
      .forEach((n) => n.style.display = "none");
    document.getElementById("doneBig").textContent = action === "finalize"
      ? (store.plan.followUp ? "🎉 Follow-ups answered — the build resumes."
                             : "🎉 Plan finalized — handed back to the agent.")
      : "✓ Round sent to the agent.";
    document.getElementById("doneSmall").textContent = action === "finalize"
      ? "All saved. The agent has your plan and is taking it from here — you can close this tab."
      : "All saved. The agent is working on your round — you can close this tab.";
    document.getElementById("done").classList.add("show");
    document.getElementById("submitbar").style.display = "none";
    window.scrollTo(0, 0);
    // best-effort auto-close for script-opened tabs; harmless no-op otherwise
    setTimeout(() => { try { window.close(); } catch (e) {} }, 400);
  };
  document.getElementById("sendRound").addEventListener("click", () => ship("send-round"));
  document.getElementById("finalize").addEventListener("click", () => ship("finalize"));

  // ---------- live mode: reconcile in place from SSE plan-updated events ----------
  // pendingAsk (on the store) tracks cards awaiting a live reply: cardId ->
  // { len, text } captured when the message was sent. When the thread grows
  // past that length, the agent has replied.
  const threadLen = (cid) => {
    const d = store.byId(cid);
    return d && d.thread ? d.thread.length : 0;
  };

  const reconcile = (newPlan) => {
    // capture volatile UI state so a rebuild is invisible to the user
    const openIds = new Set([...document.querySelectorAll(".card.open")].map((c) => c.dataset.id));
    const scrollY = window.scrollY;
    const active = document.activeElement;
    const focusId = active && active.closest ? (active.closest(".card") || {}).dataset?.id : null;
    const focusSel = active && active.classList && active.classList.contains("chat-input") ? "chat"
      : active && active.tagName === "TEXTAREA" ? "answer" : null;

    store.plan = newPlan;
    store.round = newPlan.round || store.round;
    app.renderSections();

    // restore open-state; auto-open any card whose thread just grew (answer arrived)
    store.cards.forEach((c) => {
      if (openIds.has(c.id)) c.el.classList.add("open");
      const p = store.pendingAsk[c.id];
      if (p != null && threadLen(c.id) > p.len) {
        c.el.classList.add("open");           // reveal the fresh answer
        delete store.pendingAsk[c.id];
      }
      if (store.pendingAsk[c.id] != null) c.el.classList.add("awaiting");  // still thinking
    });
    // re-show any pending user message + awaiting bubble the rebuild wiped,
    // until the agent's reply grows the real thread past where we asked
    store.cards.forEach((c) => {
      const p = store.pendingAsk[c.id];
      if (p == null || typeof p !== "object") return;
      if (threadLen(c.id) > p.len) return;        // reply already landed
      const chat = c.el.querySelector(".chat-blk");
      if (!chat) return;
      const th = chat.querySelector(".thread");
      const mine = el("div", "msg");
      mine.appendChild(el("div", "who user", "You"));
      mine.appendChild(mdEl(null, p.text));
      th.style.display = ""; th.appendChild(mine);
      const aw = chat.querySelector(".chat-await");
      // restart the honest-wait countdown from the rebuild (don't reset to 0s
      // each reconcile — only (re)start if it isn't already counting)
      if (aw && aw._startAwait) aw._startAwait();
      else if (aw) aw.style.display = "";
    });
    // restore focus where possible
    if (focusId && focusSel) {
      const card = document.querySelector(`.card[data-id="${focusId}"]`);
      const ta = card && (focusSel === "chat" ? card.querySelector(".chat-input")
                                              : card.querySelector(".card-body textarea"));
      if (ta) { ta.focus(); }
    }
    window.scrollTo(0, scrollY);
    refreshAll();
  };

  const liveDot = document.getElementById("liveDot");
  const setLive = (state) => {
    liveDot.className = "live-dot " + state;     // connected | reconnecting
    liveDot.title = state === "connected" ? "Live — answers update in place"
                                          : "Reconnecting to the live stream…";
  };
  const startLive = () => {
    let es;
    try { es = new EventSource("/events"); }
    catch (e) { return; }                        // not in live mode / no server
    es.addEventListener("plan-updated", (ev) => {
      try {
        reconcile(JSON.parse(ev.data)); setLive("connected");
        // a plan update may carry the grill questions the agent just wrote —
        // re-enable the button and clear the pending note
        const gb = document.getElementById("grillIntents");
        const gs = document.getElementById("grillIntentsState");
        if (gb) gb.disabled = false;
        if (gs) gs.textContent = "";
      } catch (e) { console.warn("bad plan-updated payload", e); }
    });
    es.onopen = () => setLive("connected");
    es.onerror = () => setLive("reconnecting");  // EventSource auto-reconnects
  };

  // expose a live-ask hook used by each card's chat composer (see buildCard).
  // Records the pending message + thread length so a mid-flight reconcile can
  // re-show it; the agent appends both turns to the thread, which supersedes it.
  window.__askNow = (cardId, text) => {
    if (!text || !text.trim()) return false;
    store.pendingAsk[cardId] = { len: threadLen(cardId), text: text.trim() };
    const card = document.querySelector(`.card[data-id="${cardId}"]`);
    if (card) card.classList.add("awaiting");
    fetch("/ask", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "q-" + cardId + "-" + Date.now(), cardId, text: text.trim() }),
    }).catch(() => {});                           // queued server-side regardless
    return true;
  };

  // --- "interview me" grill trigger for the intents section ---
  // Sends a grill request down the same /ask channel the chat uses. The agent
  // sees it on stdout, writes agentQuestions[] onto the intents, and they
  // stream back into the cards over SSE. No new server endpoint.
  const grillBtn = document.getElementById("grillIntents");
  const grillStateEl = document.getElementById("grillIntentsState");
  if (grillBtn) {
    grillBtn.addEventListener("click", () => {
      const text = "[GRILL REQUEST] Interview me to sharpen my intents: write "
        + "pointed agentQuestions[] onto the fuzzy/ambiguous intents so I can "
        + "clarify them in place.";
      fetch("/ask", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "grill-intents-" + Date.now(),
          cardId: "__intents__", text,
        }),
      })
        .then(() => {
          grillStateEl.textContent = "🎤 sent — the agent is writing clarifying questions…";
          grillBtn.disabled = true;
        })
        .catch(() => { grillStateEl.textContent = "⚠ could not reach the agent — try Send to agent."; });
    });
  }

  return { startLive, reconcile };
};
