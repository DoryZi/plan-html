// The shared card builder: turns one plan item (intent / boundary / decision /
// step) into an interactive card, wiring inline authoring, the agent grill, the
// chat composer, mock/option pickers and free text. Every card pushes a record
// onto store.cards with a refresh() used by the progress bar and reconcile.
//
// buildCard reads everything it needs from the `app` context (store + bound
// helpers: el, mdEl, md, escapeHtml, persist, touched, openLightbox,
// zoomableDiagram, refreshAddBtns), keeping behavior identical to the original
// single-closure implementation.

import { titleOf } from "./state.js";

const chipClass = (s) => s === "needs-you" ? "you" : s === "agent-call" ? "agent" : "fyi";
const chipText = (s) => s === "needs-you" ? "needs you" : s === "agent-call" ? "agent's call" : "FYI";

export const buildCard = (app, d, i, kind, container) => {
  const { store, el, mdEl, md, escapeHtml, persist, touched, openLightbox, zoomableDiagram } = app;
  const { answers } = store;
  const ans = store.ans;
  const byId = store.byId;
  const dismissed = store.dismissed;
  const satisfied = store.satisfied;
  const hasQuestion = store.hasQuestion;

  const card = el("div", "card");
  card.dataset.id = d.id;

  const head = el("div", "card-head");
  const grip = el("span", "grip", "⠿");
  grip.title = "Drag to set priority order";
  head.appendChild(grip);
  head.appendChild(el("span", "chev", "▶"));
  head.appendChild(el("span",
    kind === "intent" ? "chip intent"
      : kind === "boundary" ? "chip boundary"
      : kind === "step" ? "chip step"
      : "chip " + chipClass(d.status),
    kind === "intent" ? "intent" : kind === "boundary" ? "boundary"
      : kind === "step" ? "step" : chipText(d.status)));
  const titleWrap = el("div", "card-title");
  const prefix = kind === "intent" ? `I${i + 1}. `
    : kind === "boundary" ? `B${i + 1}. `
    : kind === "step" ? `Step ${i + 1} — ` : `${i + 1}. `;
  const titleEl = el("div", "t", prefix + (titleOf(d) || "Untitled"));
  titleWrap.appendChild(titleEl);
  const summaryLine = el("div", "s", d.summary || "");
  if (!d.summary) summaryLine.style.display = "none";
  titleWrap.appendChild(summaryLine);
  head.appendChild(titleWrap);
  if (d.userAdded) head.appendChild(el("span", "added-tag", "added by you"));

  // inline quick-answer — answer common picks without expanding the card
  const quick = el("div", "quick");
  head.appendChild(quick);

  const state = el("div", "state", "—");
  head.appendChild(state);

  // dismiss / restore — tick a card off (boundaries can be dropped; others set aside)
  const dropBtn = el("button", "icon-btn drop", "✕");
  dropBtn.type = "button";
  dropBtn.title = "Strike out — removed from the plan when you send the round";
  dropBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    const a = ans(d.id);
    a.dismissed = !a.dismissed;
    touched();
  });
  head.appendChild(dropBtn);

  head.addEventListener("click", () => card.classList.toggle("open"));
  card.appendChild(head);

  const body = el("div", "card-body");

  // --- inline authoring ---
  // Real input fields bound straight to the card object `d`. Shown for cards
  // the user added (author from scratch) AND for ALL step cards (steps are
  // editable in place — the user can rewrite or delete any step). Edits write
  // to `d`, refresh the title, and autosave.
  const authorable = d.userAdded || kind === "step";
  if (authorable) {
    const auth = el("div", "blk authoring");
    auth.appendChild(el("div", "lbl",
      d.userAdded ? `New ${kind} — fill in what you can` : "Edit this step"));
    // Editing an AGENT step mutates a copy in the persisted `added.steps`
    // bucket (not PLAN, which a live SSE update would overwrite). On first
    // edit we relocate this card's data there so the change survives reload
    // and reconcile. `target` is whatever object the fields write to.
    let target = d;
    const ensurePersisted = () => {
      if (target.userAdded || store.added.steps.some((s) => s.id === target.id)) return;
      // relocate this agent step's data into the persisted added.steps bucket
      // (keyed by the same id, so render swaps it back into its position)
      const copy = { ...target, kind: "step", userEdited: true };
      store.added.steps.push(copy);
      target = copy;
    };
    // field(label, key, {area, placeholder, onInput}) → bound input/textarea
    const field = (label, key, opts = {}) => {
      const wrap = el("div", "afield");
      wrap.appendChild(el("label", "albl", label));
      const inp = opts.area ? el("textarea") : el("input");
      if (!opts.area) inp.type = "text";
      inp.className = "ainput";
      inp.placeholder = opts.placeholder || "";
      inp.value = d[key] || "";
      inp.addEventListener("input", () => {
        if (kind === "step") ensurePersisted();
        target[key] = inp.value;
        if (opts.onInput) opts.onInput();
        persist();
      });
      wrap.appendChild(inp);
      auth.appendChild(wrap);
      return inp;
    };
    const syncTitle = () => { titleEl.textContent = prefix + (d.title || "Untitled"); };
    const syncSummary = () => {
      summaryLine.textContent = d.summary || "";
      summaryLine.style.display = d.summary ? "" : "none";
    };
    field("Title", "title", { placeholder: "Short title…", onInput: syncTitle });
    if (kind === "intent") {
      field("The intent (what you want + why)", "intent",
        { area: true, placeholder: "I want… so that…" });
      d.verify = d.verify || { method: "", command: "", expected: "" };
      const vrow = el("div", "afield");
      vrow.appendChild(el("label", "albl", "How we verify this (optional — agent can fill in)"));
      const vbox = el("div", "averify");
      ["method", "command", "expected"].forEach((k) => {
        const inp = el("input"); inp.type = "text"; inp.className = "ainput";
        inp.placeholder = k; inp.value = d.verify[k] || "";
        inp.addEventListener("input", () => { d.verify[k] = inp.value; persist(); });
        vbox.appendChild(inp);
      });
      vrow.appendChild(vbox);
      auth.appendChild(vrow);
    } else if (kind === "boundary") {
      field("The boundary (what's in/out of scope, what not to touch)", "boundary",
        { area: true, placeholder: "In scope… Out of scope… Do not touch…" });
    } else if (d.kind === "step" || kind === "step") {
      field("Description", "description", { area: true, placeholder: "What this step does…" });
      field("Files", "files", { placeholder: "path/to/file" });
      field("Test", "test", { placeholder: "e2e / unit / …" });
      field("Intent it serves", "intent", { placeholder: "intent-id" });
    } else {
      // decision
      field("One-line summary", "summary", { placeholder: "Shown on the collapsed card", onInput: syncSummary });
      field("What we're building", "building", { area: true, placeholder: "Describe the fork / what's being decided…" });
      const orow = el("div", "afield");
      orow.appendChild(el("label", "albl", "Options (one per line — leave blank for Approve/Reject)"));
      const ota = el("textarea"); ota.className = "ainput";
      ota.placeholder = "Option A\nOption B";
      ota.value = (d.options || []).filter((o) => typeof o === "string").join("\n");
      ota.addEventListener("input", () => {
        d.options = ota.value.split("\n").map((s) => s.trim()).filter(Boolean);
        persist();
      });
      orow.appendChild(ota);
      auth.appendChild(orow);
      const srow = el("div", "afield");
      srow.appendChild(el("label", "albl", "Who decides"));
      const sel = el("select"); sel.className = "ainput";
      [["needs-you", "Needs you"], ["agent-call", "Agent's call"], ["fyi", "FYI"]]
        .forEach(([v, t]) => { const o = el("option", null, t); o.value = v; sel.appendChild(o); });
      sel.value = d.status || "needs-you";
      sel.addEventListener("change", () => { d.status = sel.value; persist(); });
      srow.appendChild(sel);
      auth.appendChild(srow);
    }
    body.appendChild(auth);
  }

  // --- intent/boundary text (editable in place) ---
  // (user-added cards author this directly above, so skip the review/edit view)
  if (!d.userAdded && (kind === "intent" || kind === "boundary")) {
    const baseText = kind === "intent" ? d.intent : d.boundary;
    const blk = el("div", "blk");
    blk.appendChild(el("div", "lbl", kind === "intent" ? "The intent" : "The boundary"));
    const textView = el("div", "intent-view");
    const renderText = () => {
      const a = answers[d.id] || {};
      textView.innerHTML = md((a.edit && a.edit.trim()) ? a.edit : baseText);
      if (a.edit && a.edit.trim() && a.edit !== baseText) {
        textView.appendChild(el("span", "edited-tag", "edited by you"));
      }
    };
    renderText();
    blk.appendChild(textView);
    const editBtn = el("button", "opt ghost intent-edit-btn", `Edit this ${kind}`);
    editBtn.type = "button";
    const editTa = el("textarea");
    editTa.style.display = "none";
    editTa.placeholder = `Rewrite the ${kind} in your words…`;
    const a0i = answers[d.id] || {};
    if (a0i.edit && a0i.edit.trim()) {
      editTa.value = a0i.edit;
      editTa.style.display = "";
    }
    editBtn.addEventListener("click", () => {
      const a = ans(d.id);
      editTa.value = (a.edit && a.edit.trim()) ? a.edit : baseText;
      editTa.style.display = "";
      editTa.focus();
    });
    editTa.addEventListener("input", () => {
      const a = ans(d.id);
      a.edit = editTa.value === baseText ? "" : editTa.value;
      renderText();
      touched();
    });
    blk.appendChild(editBtn);
    blk.appendChild(editTa);
    body.appendChild(blk);
  }

  // --- agent's grill / clarifying questions (mostly on intents) ---
  // The agent poses pointed questions to sharpen a fuzzy intent. Each renders
  // with its own answer box; answers persist in answers[id].grill[qid] and
  // ride back with the round. Soft-gating: surfaced + counted, never blocking.
  if (d.agentQuestions && d.agentQuestions.length) {
    const blk = el("div", "blk grill-blk");
    const lbl = el("div", "lbl", "Help me sharpen this — a few clarifying questions");
    blk.appendChild(lbl);
    const a = ans(d.id);
    a.grill = a.grill || {};
    d.agentQuestions.forEach((gq, qi) => {
      const qid = (typeof gq === "object" ? gq.id : null) || `q${qi}`;
      const qtext = typeof gq === "object" ? gq.q : gq;
      const item = el("div", "grill-q");
      const qline = el("div", "grill-ask");
      qline.innerHTML = md(qtext).replace(/^<p>|<\/p>$/g, "");
      item.appendChild(qline);
      const ta = el("textarea", "ainput grill-ans");
      ta.rows = 2;
      ta.placeholder = "Your answer…";
      ta.value = (a.grill[qid] || "");
      const markAnswered = () => item.classList.toggle("answered", Boolean(ta.value.trim()));
      markAnswered();
      ta.addEventListener("input", () => {
        ans(d.id).grill[qid] = ta.value;
        markAnswered();
        touched();
      });
      item.appendChild(ta);
      blk.appendChild(item);
    });
    body.appendChild(blk);
  }

  // --- descriptive blocks (markdown-rendered) ---
  if (d.building && !d.userAdded) {
    const b = el("div", "blk");
    b.appendChild(el("div", "lbl", "What we're building"));
    b.appendChild(mdEl(null, d.building)); body.appendChild(b);
  }
  if (d.tradeoffs && d.tradeoffs.length) {
    const b = el("div", "blk");
    b.appendChild(el("div", "lbl", "Tradeoffs"));
    const ul = el("ul", "tradeoffs");
    d.tradeoffs.forEach((t) => {
      const li = el("li");
      li.innerHTML = md(t).replace(/^<p>|<\/p>$/g, ""); ul.appendChild(li);
    });
    b.appendChild(ul); body.appendChild(b);
  }

  // --- related cards (dependsOn) — live view of your other answers ---
  let relatedEl = null;
  if (d.dependsOn && d.dependsOn.length) {
    const b = el("div", "blk");
    b.appendChild(el("div", "lbl", "Related — your answers elsewhere"));
    relatedEl = el("div", "related");
    b.appendChild(relatedEl);
    body.appendChild(b);
  }
  const renderRelated = () => {
    if (!relatedEl) return;
    relatedEl.innerHTML = "";
    d.dependsOn.forEach((rid) => {
      const rd = byId(rid);
      const line = el("div", "rel-line");
      const a = answers[rid] || {};
      const t = rd ? titleOf(rd) : rid;
      if (a.choice || (a.answer && a.answer.trim())) {
        line.innerHTML = `<b>${escapeHtml(t)}</b> — you said: ` +
          `<span class="rel-choice">${escapeHtml(a.choice || "")}` +
          `${a.choice && a.answer && a.answer.trim() ? " · " : ""}` +
          `${escapeHtml((a.answer || "").trim().slice(0, 140))}</span>`;
      } else if (a.edit && a.edit.trim()) {
        line.innerHTML = `<b>${escapeHtml(t)}</b> — you rewrote it: ` +
          `<span class="rel-choice">${escapeHtml(a.edit.trim().slice(0, 140))}</span>`;
      } else {
        line.innerHTML = `<b>${escapeHtml(t)}</b> — ` +
          `<span class="rel-none">not answered yet</span>`;
      }
      relatedEl.appendChild(line);
    });
  };

  // --- verify block (per intent/decision) ---
  // (user-added cards author verify inline above — no read-only echo)
  if (d.verify && !d.userAdded) {
    const b = el("div", "blk");
    b.appendChild(el("div", "lbl", "How we verify this"));
    const v = el("div", "verify");
    if (typeof d.verify === "string") {
      v.appendChild(mdEl(null, d.verify));
    } else {
      const row = (k, val, cmd) => {
        if (!val) return;
        const r = el("div", "vrow"); r.appendChild(el("div", "vk", k));
        const vv = el("div", "vv" + (cmd ? " cmd" : ""));
        if (cmd) vv.textContent = val;
        else vv.innerHTML = md(val).replace(/^<p>|<\/p>$/g, "");
        r.appendChild(vv); v.appendChild(r);
      };
      row("Method", d.verify.method);
      row("Command", d.verify.command, true);
      row("Expected", d.verify.expected);
    }
    b.appendChild(v);
    body.appendChild(b);
  }

  // --- per-card diagram ---
  if (d.diagramSvg) {
    const b = el("div", "blk");
    b.appendChild(el("div", "lbl", "Diagram"));
    const dv = el("div", "diagram");
    dv.innerHTML =
      `<svg viewBox="${d.diagramViewBox || '0 0 720 240'}" role="img" aria-label="card diagram">
           <defs><marker id="arrow-${d.id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7"
             markerHeight="7" orient="auto-start-reverse">
             <path d="M0,0 L10,5 L0,10 z" fill="#9aa3b2"/></marker></defs>
           ${d.diagramSvg.replaceAll("url(#arrow)", `url(#arrow-${d.id})`)}</svg>`;
    zoomableDiagram(dv, d.title || "Diagram");
    b.appendChild(dv);
    body.appendChild(b);
  }

  // --- Q&A with the agent: a live chat (thread + composer pinned below it) ---
  // The composer is ALWAYS here (not buried in "Your answer"), so after the
  // agent replies you just type a follow-up and send again — a real back and
  // forth. Distinct from the decision answer below.
  // Steps have no question/answer controls — they're just authored fields.
  if (kind !== "step") {
    const hasThread = d.thread && d.thread.length;
    const b = el("div", "blk chat-blk");
    b.appendChild(el("div", "lbl", "Discuss with the agent"));
    const th = el("div", "thread");
    if (hasThread) {
      d.thread.forEach((m) => {
        const msg = el("div", "msg");
        msg.appendChild(el("div", "who " + (m.role === "agent" ? "agent" : "user"),
          m.role === "agent" ? "Agent" : "You"));
        msg.appendChild(mdEl(null, m.text));
        th.appendChild(msg);
      });
    }
    th.style.display = hasThread ? "" : "none";
    b.appendChild(th);

    // awaiting bubble — shown while a sent message has no reply yet. If no
    // reply lands within ~25s, switch to an honest "queued, no agent
    // watching" message so an unattended deck doesn't masquerade as a slow AI.
    const awaitMsg = el("div", "ask-pending chat-await", "agent is replying…");
    awaitMsg.style.display = "none";
    b.appendChild(awaitMsg);
    let awaitTimer = null;
    const startAwait = () => {
      awaitMsg.style.display = "";
      awaitMsg.textContent = "agent is replying…";
      awaitMsg.classList.remove("stale");
      clearTimeout(awaitTimer);
      awaitTimer = setTimeout(() => {
        awaitMsg.textContent =
          "still queued — no agent is watching this deck right now; "
          + "it'll answer as soon as one is.";
        awaitMsg.classList.add("stale");
      }, 25000);
    };
    const stopAwait = () => { clearTimeout(awaitTimer); awaitMsg.style.display = "none"; };
    // let reconcile() reach these per-card hooks across rebuilds
    awaitMsg._startAwait = startAwait;
    awaitMsg._stopAwait = stopAwait;

    // composer: textarea + Send. Enter sends, Shift+Enter newlines.
    const composer = el("div", "composer");
    const cta = el("textarea", "chat-input");
    cta.rows = 2;
    cta.placeholder = hasThread
      ? "Reply, comment, or ask a follow-up — sends straight to the agent…"
      : "Comment, question, or push back — sends straight to the agent…";
    const sendQ = el("button", "btn chat-send", "Send ▸");
    sendQ.type = "button";
    const sendNow = () => {
      const text = cta.value.trim();
      if (!text) { cta.focus(); return; }
      // optimistic: show your message immediately
      const mine = el("div", "msg");
      mine.appendChild(el("div", "who user", "You"));
      mine.appendChild(mdEl(null, text));
      th.style.display = ""; th.appendChild(mine);
      startAwait();
      cta.value = "";
      if (window.__askNow) window.__askNow(d.id, text);
      else { ans(d.id).question = text; touched(); }   // non-live fallback → next round
      cta.focus();
    };
    sendQ.addEventListener("click", sendNow);
    cta.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendNow(); }
    });
    composer.appendChild(cta);
    composer.appendChild(sendQ);
    b.appendChild(composer);
    body.appendChild(b);
  }

  // --- answer controls: wireframe mocks + option buttons ---
  const a0 = answers[d.id] || {};
  const optBlk = el("div", "blk");
  optBlk.appendChild(el("div", "lbl", "Your decision"));
  const rawOpts = d.options || [];
  // options can be strings (buttons) or mock objects:
  //   {label, caption, viewBox, svg}            — lo-fi wireframe
  //   {label, caption, html, width?, height?}   — hi-fi HTML mock (sandboxed iframe)
  const mockOpts = rawOpts.filter((o) => o && typeof o === "object" && (o.svg || o.html));
  const plainOpts = rawOpts.filter((o) => typeof o === "string");
  // choiceEls collects every clickable choice (mock tiles, body buttons, quick
  // buttons) so refresh() can sync the selected highlight across all of them
  const choiceEls = [];
  const pickChoice = (val) => {
    const a = ans(d.id);
    a.choice = a.choice === val ? null : val;   // toggle off — free text can stand alone
    touched();
  };
  let mocksGrid = null;
  const syncChoiceEls = () => {
    const cur = (answers[d.id] || {}).choice;
    choiceEls.forEach(({ el: e, val }) => e.classList.toggle("sel", val === cur));
    // dim the unchosen mocks once a mock is picked, so the selection pops
    if (mocksGrid) {
      const mockPicked = [...mocksGrid.querySelectorAll(".mock")]
        .some((m) => m.classList.contains("sel"));
      mocksGrid.classList.toggle("has-sel", mockPicked);
    }
  };
  if (mockOpts.length) {
    const grid = el("div", "mocks");
    mocksGrid = grid;
    mockOpts.forEach((o, mi) => {
      const label = o.label || `Option ${mi + 1}`;
      const W = o.width || 800, H = o.height || 600;
      const makeSvg = () =>
        `<svg viewBox="${o.viewBox || '0 0 200 140'}" role="img" aria-label="${escapeHtml(label)}">${o.svg}</svg>`;
      const makeFrame = () => {
        const fr = document.createElement("iframe");
        fr.setAttribute("sandbox", "");          // no scripts inside mocks
        fr.srcdoc = o.html;
        fr.width = W; fr.height = H;
        return fr;
      };
      const m = el("div", "mock");
      if (o.svg) {
        m.innerHTML = makeSvg();
      } else {
        const wrap = el("div", "mock-htmlwrap");
        wrap.style.aspectRatio = `${W} / ${H}`;
        const fr = makeFrame();
        wrap.appendChild(fr);
        m.appendChild(wrap);
        // scale the full-size mock down to the tile width
        requestAnimationFrame(() => {
          const s = wrap.clientWidth / W;
          if (s > 0 && s < 1) fr.style.transform = `scale(${s})`;
        });
      }
      const enlarge = () => openLightbox(label, (c) => {
        if (o.svg) c.innerHTML = makeSvg();
        else c.appendChild(makeFrame());
      });
      const zoom = el("button", "mock-zoom", "⤢");
      zoom.type = "button"; zoom.title = "Enlarge";
      zoom.addEventListener("click", (ev) => { ev.stopPropagation(); enlarge(); });
      m.appendChild(zoom);
      m.appendChild(el("div", "mock-label", label));
      if (o.caption) m.appendChild(el("div", "mock-cap", o.caption));
      const big = el("button", "opt ghost mock-enlarge", "⤢ Open full size");
      big.type = "button";
      big.addEventListener("click", (ev) => { ev.stopPropagation(); enlarge(); });
      m.appendChild(big);
      choiceEls.push({ el: m, val: label });
      m.addEventListener("click", () => pickChoice(label));
      grid.appendChild(m);
    });
    // the mocks ARE the decision — they lead the card, prose follows below
    const mocksBlk = el("div", "blk mocks-lead");
    mocksBlk.appendChild(el("div", "lbl", "The directions — click one to pick it"));
    mocksBlk.appendChild(grid);
    body.prepend(mocksBlk);
    card.classList.add("open");  // mocks must be visible without clicking
  }
  const opts = el("div", "opts");
  const choices = (mockOpts.length || plainOpts.length)
    ? plainOpts.map((o) => ({ kind: "custom", label: o }))
    : kind === "intent"
      ? [{ kind: "approve", label: "This is what I want" },
         { kind: "reject", label: "Not quite — see my notes/edit" }]
      : kind === "boundary"
        ? [{ kind: "approve", label: "Agreed — respect this" },
           { kind: "reject", label: "Not quite — see my notes/edit" },
           { kind: "custom", label: "Not needed — drop it" }]
        : [{ kind: "approve", label: "Approve" },
           { kind: "reject", label: "Reject / change" },
           { kind: "agent", label: "Your call, agent" }];
  const valOf = (c) => c.kind === "custom" ? c.label : c.kind;
  // inline quick-answer buttons on the collapsed head — text choices only
  // (mock picks need the visual, so those stay in the body). Short labels.
  if (!mockOpts.length) {
    choices.forEach((c) => {
      const qb = el("button", "qbtn", c.label);
      qb.type = "button"; qb.dataset.kind = c.kind;
      qb.title = c.label;
      const val = valOf(c);
      qb.addEventListener("click", (ev) => { ev.stopPropagation(); pickChoice(val); });
      choiceEls.push({ el: qb, val });
      quick.appendChild(qb);
    });
  }
  choices.forEach((c) => {
    const btn = el("button", "opt", c.label);
    btn.type = "button"; btn.dataset.kind = c.kind;
    const val = valOf(c);
    btn.addEventListener("click", () => pickChoice(val));
    choiceEls.push({ el: btn, val });
    opts.appendChild(btn);
  });
  if (choices.length) optBlk.appendChild(opts);

  // --- free text — counts as a full answer on its own ---
  const ta = el("textarea");
  ta.placeholder = "Or answer in your own words — free text counts as an answer. "
    + "Add detail, redirect, or explain your pick…";
  if (a0.answer) ta.value = a0.answer;
  ta.addEventListener("input", () => { ans(d.id).answer = ta.value; touched(); });
  optBlk.appendChild(ta);

  // steps are authored, not answered — no decision/free-text controls
  if (kind !== "step") body.appendChild(optBlk);
  card.appendChild(body);
  container.appendChild(card);

  // count the agent's grill questions still unanswered on this card (soft)
  const grillOpen = () => {
    if (!(d.agentQuestions && d.agentQuestions.length) || dismissed(d.id)) return 0;
    const g = (answers[d.id] || {}).grill || {};
    return d.agentQuestions.reduce((n, gq, qi) => {
      const qid = (typeof gq === "object" ? gq.id : null) || `q${qi}`;
      return n + ((g[qid] || "").trim() ? 0 : 1);
    }, 0);
  };
  const refresh = () => {
    renderRelated();
    syncChoiceEls();
    const dz = dismissed(d.id);
    const q = hasQuestion(d.id), s = satisfied(d.id) && !dz;
    const go = grillOpen();
    state.textContent = dz ? "set aside"
      : q ? (satisfied(d.id) ? "answered + question" : "question for agent")
      : go ? (s ? `answered · ${go} to clarify` : `${go} to clarify`)
      : s ? "answered" : "—";
    state.className = "state" + (dz ? " dz" : go ? " grill" : s ? " set" : q ? " q" : "");
    card.classList.toggle("has-grill", go > 0);
    dropBtn.textContent = dz ? "↩" : "✕";
    dropBtn.title = dz ? "Bring this back" : dropBtn.title;
    card.classList.toggle("answered", s);
    card.classList.toggle("questioned", q && !s);
    card.classList.toggle("dismissed", dz);
  };
  store.cards.push({ id: d.id, kind, data: d, el: card, refresh });
};
