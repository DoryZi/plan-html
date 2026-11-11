/* The prototype's screens, actions and scenarios, on proto-kit (Proto.screen, Proto.action,
   Proto.scenario, Proto.variant, Proto.html). Markup and class names are the real app's
   (crm/web/templates: base.html, pipeline/*, today/*, company/*, components/*), so app.css, which is
   the real CSS, draws it the same.

   Scope: job mail and the applications it belongs to. Inside it everything works for real: the
   Applications table, the company page (stage, next step, timeline, people, emails, changes from
   email), Add missing email (search your mail), To confirm, every person and Changes. Every email opens
   in place, in the list it is in. Outside it (other pipelines, Find leads, Import, Settings, Add a
   job...) stays visible and says so when clicked (data-out).

   Fork "linking" (Proto.variant("linking")): what happens when the app knows where an email belongs.
     A  links it on its own; the company shows what changed, with Undo, and Changes lists it.
     B  asks first: matches wait in To confirm; Attach asks "Link it?" too.
     C  links sure matches (same thread, same sender) on its own and asks for the unsure ones.
   The three new emails in data.js (incoming) go through it when the page loads.

   Routes: #/ Today, #/jobs Applications, #/company/<id>, #/company/<id>/add-email, #/confirm
   (?open=<email> opens one), #/person/<id> (?from=<route> says where Back goes), #/changes.
   Scenarios: linked (the invite attached), confirmed (B: Maya's email confirmed), confirmed-c (C: the
   Topgig match confirmed), filtered (Applications: Remote, by pay). */
(function () {
  "use strict";
  const P = window.Proto;
  const h = P.html;
  const S = () => P.state;

  // ---- Small helpers -------------------------------------------------------------------------

  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const LONG_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  /** "2026-10-28" as "Oct 28". */
  const short = (iso) => {
    if (!iso) return "";
    const p = iso.split("-");
    return `${MONTHS[+p[1] - 1]} ${+p[2]}`;
  };
  /** "2026-10-28", "16:40" as "Wednesday, October 28, 2026 at 16:40". */
  const longDate = (iso, time) => {
    const p = iso.split("-").map(Number);
    const day = DAYS[new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay()];
    return `${day}, ${LONG_MONTHS[p[1] - 1]} ${p[2]}, ${p[0]}${time ? ` at ${time}` : ""}`;
  };
  const upper = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
  const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const on = (cond, text) => (cond ? P.raw(" " + text) : "");
  const byTime = (x, y) => (x.day + x.time < y.day + y.time ? -1 : 1);
  const newestFirst = (x, y) => (x.day < y.day ? 1 : x.day > y.day ? -1 : 0);
  const firstName = (name) => name.split(" ")[0];
  const domainOf = (email) => (email.split("@")[1] || "").toLowerCase();
  /** The day after an ISO day. */
  const nextDay = (iso) => new Date(Date.parse(iso + "T12:00:00Z") + 864e5).toISOString().slice(0, 10);
  const split2 = (arg) => {
    const at = arg.indexOf("|");
    return [arg.slice(0, at), arg.slice(at + 1)];
  };

  const ICONS = {
    close: "M6 6l12 12M18 6L6 18",
    back: "M15 6l-6 6 6 6",
    menu: "M4 7h16M4 12h16M4 17h16",
    check: "M5 12l5 5 9-10",
    "sort-desc": "M6 9l6 6 6-6",
    plus: "M12 5v14M5 12h14",
  };
  const icon = (name, size = 18) =>
    P.raw(`<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
      `stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">` +
      `<path d="${ICONS[name]}"></path></svg>`);

  /** The fork: A links on its own, B asks first, C links when sure and asks when not. */
  const mode = () => P.variant("linking");
  const asks = (m) => mode() === "B" || (mode() === "C" && !(m.reads && m.reads.sure));
  const app = (id) => S().apps.find((a) => a.id === id);
  const mailById = (id) => S().mail.find((m) => m.id === id);
  function personWhere(test) {
    for (const a of S().apps) {
      const p = a.people.find(test);
      if (p) return { a, p };
    }
    return null;
  }
  const personById = (id) => personWhere((p) => p.id === id);
  const personByEmail = (email) => (email ? personWhere((p) => p.email.toLowerCase() === email.toLowerCase()) : null);
  const toConfirm = () => S().mail.filter((m) => m.waiting && !m.linkedTo).sort((x, y) => byTime(y, x));
  const isOpen = (a) => a.stage !== "Won" && a.stage !== "Lost";
  const rank = (stage) => {
    const i = S().stages.indexOf(stage);
    return i >= 0 ? i : stage === "Won" ? 6 : -1;
  };
  const dotKind = (stage) => (stage === "New" ? "contact" : stage === "Applied" ? "prospect" : stage === "Won" ? "won" : stage === "Lost" ? "lost" : "active");
  const stageText = (a) => (a.stage === "Lost" ? `Lost, ${(S().lostReasons[a.lostReason] || "lost").toLowerCase()}` : a.stage);
  const overdue = (a) => isOpen(a) && a.due && a.due < S().today;
  const dueWord = (a) => (a.due === S().today ? "today" : short(a.due));
  const touchText = (a) => (a.touch ? `${a.touch.kind}, ${short(a.touch.day)}` : "Nothing yet");
  const stepText = (a) => (!isOpen(a) ? "" : (a.next || (a.due ? "Set the next step" : "")) + (a.due ? `, ${dueWord(a)}` : ""));

  // ---- Components (components/*.html) --------------------------------------------------------

  const status = (kind, text) => h`<span class="status"><span class="dot dot-${kind}" aria-hidden="true"></span>${text}</span>`;
  const closeBar = (pct) => {
    const v = Math.max(0, Math.min(100, Math.round(pct)));
    return h`<span class="close-pct">${v}%<span class="bar" aria-hidden="true"><span class="bar-fill" style="width: ${v}%"></span></span></span>`;
  };
  const mark = (text, tone = "warn", title = null) => h`<span class="mark mark-${tone}"${title ? h` title="${title}"` : ""}>${text}</span>`;
  const pageHeader = (title, sub, eyebrow, actions) => h`<header class="page-head">
<div class="page-titles">
${eyebrow ? h`<p class="page-eyebrow">${eyebrow}</p>` : ""}
<h1>${title}</h1>
${sub ? h`<p class="page-sub">${sub}</p>` : ""}
</div>
${actions ? h`<div class="page-actions">${actions}</div>` : ""}
</header>`;
  const emptyState = (title, text) => h`<div class="empty"><p class="empty-title">${title}</p>${text ? h`<p>${text}</p>` : ""}</div>`;
  /** components/table.html grid(): columns are labels, or html for a header cell's inside. */
  const grid = ({ columns = [], label, wrap = false, pin = false, footer = null, rows }) => h`<div class="grid-box${pin ? " grid-pin" : ""}">
<div class="grid-scroll"${label ? h` role="region" aria-label="${label}" tabindex="0"` : ""}>
<table class="grid${wrap ? " grid-wrap" : ""}">
${columns.length ? h`<thead><tr>${columns.map((c) => h`<th scope="col">${c}</th>`)}</tr></thead>` : ""}
<tbody>
${rows}
</tbody>
</table>
</div>
${footer ? h`<p class="grid-foot">${footer}</p>` : ""}
</div>`;
  /** pipeline/_cells.html cap_cell(): text cut to fit, the whole of it in the tooltip. */
  const cap = (text, kind, opts = {}) => h`<td${opts.cls ? h` class="${opts.cls}"` : ""}${text ? h` title="${text}"` : ""}><span class="cap cap-${kind}">${opts.sr ? h`<span class="sr-only">${opts.sr}</span>` : ""}${opts.html != null ? opts.html : text || ""}</span></td>`;
  const nameCell = (a) => h`<td title="${a.company}"><div class="cell-flex cap-flex cap-name"><a class="row-btn" href="#/company/${a.id}">${a.company}</a></div></td>`;
  /** A table row that opens its item when clicked anywhere (its own links and buttons still win). */
  const rowOpen = (route) => h` class="proto-row" data-action="open" data-arg="${route}"`;
  const field = (label, input, hint, err) => h`<div class="field">
<label class="field-label" for="${input.id}">${label}</label>
${input.html}
${hint ? h`<p class="field-hint">${hint}</p>` : ""}
${err ? h`<p class="field-err" role="alert">${err}</p>` : ""}
</div>`;
  /** A fold (the real co-fold); its id lets the kit keep it open across redraws. */
  const fold = (id, summary, body, cls = "") => h`<details class="co-fold${cls}" id="${id}"><summary>${summary}</summary>${body}</details>`;
  /** Something outside this design: it stays visible and says so when clicked. */
  const outLink = (label, cls, out = "app") => h`<a class="${cls}" href="#" data-out="${out}">${label}</a>`;
  const appOptions = (selected, extra = "") => {
    const list = [...S().apps].sort((x, y) => x.company.localeCompare(y.company) || x.role.localeCompare(y.role));
    return h`${list.map((o) => h`<option value="${o.id}"${on(o.id === selected, "selected")}>${o.company}, ${o.role}</option>`)}${extra}`;
  };

  // ---- The shell (base.html): phone top bar with Menu, the sidebar, main ----------------------

  function todos() {
    const s = S();
    return s.apps
      .filter((a) => isOpen(a) && a.due && a.due <= s.today)
      .sort((a, b) => b.close - a.close || a.company.localeCompare(b.company));
  }

  /** Before each draw: on a new route close the menus and forms, drop the old notice, and count the
      changes as seen once Alex leaves the Changes page. */
  P.beforeRender = ({ path }) => {
    const ui = S().ui;
    if (ui.lastPath === path) return;
    if (ui.lastPath === "changes") S().changes.forEach((c) => (c.isNew = false));
    ui.menuOpen = false;
    ui.menu = null;
    ui.nextOpen = null;
    ui.linkAsk = null;
    ui.pick = null;
    ui.openMail = {};
    ui.err = {};
    if (ui.keepNotice) ui.keepNotice = false;
    else ui.notice = null;
    ui.lastPath = path;
  };

  function shell(current, content) {
    const s = S();
    const openJobs = s.apps.filter(isOpen).length;
    const fresh = s.changes.filter((c) => c.isNew).length;
    const link = (label, href, key, count) => {
      const n = count != null ? h` <span class="nav-count">${count}</span>` : "";
      return href === "#"
        ? h`<a class="nav-link" href="#" data-out="app">${label}${n}</a>`
        : h`<a class="nav-link" href="${href}"${on(key === current, 'aria-current="page"')}>${label}${n}</a>`;
    };
    return h`<div class="shell" data-shell${on(s.ui.menuOpen, "data-menu-open")}>
<header class="topbar">
<a class="brand" href="#/"><span class="brand-dot" aria-hidden="true"></span><span>acme <span class="brand-sub">jobtrack</span></span></a>
<button type="button" class="btn btn-ghost" data-action="toggleMenu" aria-expanded="${s.ui.menuOpen ? "true" : "false"}" aria-controls="sidebar">${icon("menu")}Menu</button>
</header>
<aside class="sidebar" id="sidebar">
<a class="brand" href="#/"><span class="brand-dot" aria-hidden="true"></span><span>acme<br><span class="brand-sub">jobtrack</span></span></a>
<nav class="nav" aria-label="Main">
${link("Today", "#/", "today", todos().length)}
${link("Changes", "#/changes", "changes", fresh || null)}
${link("All opportunities", "#", null, 25 + openJobs)}
<p class="nav-section">Offers</p>
${s.otherPipelines.map((p) => link(p.name, "#", null, p.count))}
<p class="nav-section">Jobs</p>
${link("Applications", "#/jobs", "jobs", openJobs)}
${mode() === "A" ? "" : link("To confirm", "#/confirm", "confirm", toConfirm().length)}
<p class="nav-section">Add leads</p>
${link("Find leads", "#", null, null)}
${link("Import", "#", null, null)}
<div class="nav-gap" aria-hidden="true"></div>
${link("Settings", "#", null, null)}
</nav>
</aside>
<main class="main" id="main">
${content}
</main>
</div>`;
  }

  // ---- Changes: every change goes through here, so Undo can put it back ----------------------

  const nextId = (prefix) => `${prefix}-${++S().seq}`;
  const fieldOp = (a, key, after) => ({ type: "field", app: a.id, field: key, before: clone(a[key]), after });
  const mailOp = (m, key, after) => ({ type: "mail", mail: m.id, field: key, before: clone(m[key]), after });

  /** Apply an op forward ("after") or back ("before"). app: add an application; mail: a field of an
      email; field: a field of an application; person: add a person; event: add a timeline item (or
      with remove: true take it away); link: set the email's application. */
  function applyOp(op, dir) {
    if (op.type === "app") {
      if (dir === "after") S().apps.push(clone(op.item));
      else S().apps = S().apps.filter((x) => x.id !== op.item.id);
      return;
    }
    if (op.type === "mail") {
      mailById(op.mail)[op.field] = clone(op[dir]);
      return;
    }
    if (op.type === "link") {
      mailById(op.mail).linkedTo = op[dir];
      return;
    }
    const a = app(op.app);
    if (op.type === "field") a[op.field] = clone(op[dir]);
    else if (op.type === "person") {
      if (dir === "after") a.people.push(clone(op.item));
      else a.people = a.people.filter((p) => p.id !== op.item.id);
    } else if (op.type === "event") {
      if ((dir === "after") !== !!op.remove) a.timeline.push(clone(op.item));
      else a.timeline = a.timeline.filter((e) => e.id !== op.item.id);
    }
  }

  /** True while what the op did still stands (nothing changed it again since). */
  function holds(op) {
    if (op.type === "app") return !!app(op.item.id);
    if (op.type === "mail") return same(mailById(op.mail)[op.field], op.after);
    if (op.type === "link") return mailById(op.mail).linkedTo === op.after;
    const a = app(op.app);
    if (!a) return false;
    if (op.type === "field") return same(a[op.field], op.after);
    if (op.type === "person") return a.people.some((p) => p.id === op.item.id);
    if (op.type === "event") return a.timeline.some((e) => e.id === op.item.id) === !op.remove;
    return false;
  }
  const canUndo = (c) => c.state === "done" && c.ops.every(holds);

  function stamp() {
    const s = S();
    const m = s.clock;
    s.clock += 3;
    return `${short(s.today)}, ${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  }

  /** Make a change and log it. By you: its notice (with Undo) shows on the page named by notice.where.
      By the app: it shows on the company page as "Changed by email" until Alex says it looks right. */
  function makeChange({ appId, mail = null, what, details = [], why, by = "you", at = null, unsure = false, ops, notice }) {
    ops.forEach((op) => applyOp(op, "after"));
    const a = appId ? app(appId) : null;
    const c = {
      id: nextId("c"), at: at || stamp(), app: appId, appName: a ? a.company : null, mail, what, details, why, by, unsure,
      ops, state: "done", isNew: true, ok: by !== "app",
    };
    S().changes.unshift(c);
    if (notice) S().ui.notice = { where: notice.where, change: c.id, text: notice.text, open: notice.open || null };
    return c;
  }

  function undoChange(id, where) {
    const s = S();
    const c = s.changes.find((x) => x.id === id);
    if (!c || !canUndo(c)) return;
    [...c.ops].reverse().forEach((op) => applyOp(op, "before"));
    c.state = "undone";
    const link = c.ops.find((op) => op.type === "link");
    const words = !link ? "Undone." : link.after ? "Undone. The email is no longer linked." : "Undone. The email is linked again.";
    if (s.ui.notice && s.ui.notice.change === id) s.ui.notice = { where: s.ui.notice.where, change: null, text: words, open: null };
    else if (where) s.ui.notice = { where, change: null, text: words, open: null };
  }

  /** Why an email is on its application: the change that linked it, else what the app noted. */
  function whyLinked(m) {
    const c = S().changes.find((x) => x.state === "done" && x.ops.some((op) => op.type === "link" && op.mail === m.id && op.after === m.linkedTo));
    return c ? c.why : m.why || "";
  }

  /** What linking this email to this application changes, in words. */
  function effects(m, a) {
    const r = m.reads && m.reads.app === a.id ? m.reads : null;
    const parts = [];
    if (r && r.stage && isOpen(a) && rank(r.stage) > rank(a.stage)) parts.push(`moves the stage to ${r.stage}`);
    if (r && r.person && !a.people.some((p) => p.email === r.person.email)) parts.push(`adds ${r.person.name}`);
    if (r && r.next) parts.push(`sets the next step: ${r.next}, ${short(r.due)}`);
    return `Links the email${parts.length ? `, ${parts.join(", ")}` : ""}.`;
  }

  /** Link an email to an application: the email, and what the app reads from it when it is about this
      application (stage, person, next step). One change, one Undo. */
  function linkEmail(appId, mailId, { where, by = "you", at = null, text = null } = {}) {
    const s = S();
    const a = app(appId);
    const m = mailById(mailId);
    const r = m.reads && m.reads.app === appId ? m.reads : null;
    const ops = [{ type: "link", app: appId, mail: m.id, before: m.linkedTo, after: appId }];
    if (m.waiting) ops.push(mailOp(m, "waiting", false));
    const details = [];
    let words = text || (where === "confirm" ? `Linked to ${a.company}, ${a.role}.` : "Linked 1 email.");
    ops.push({
      type: "event", app: appId,
      item: {
        id: nextId("e"), day: m.day, kind: "email", mail: m.id, text: `Email in from ${m.fromName}: "${m.subject}"`, justLinked: true,
        why: r ? `Why linked: ${r.why}.` : `Why linked: you picked ${a.company}.`,
      },
    });
    if (r && r.stage && isOpen(a) && rank(r.stage) > rank(a.stage)) {
      const to = s.stageClose[r.stage];
      details.push(`Stage: ${a.stage} to ${r.stage}`, `Close: ${a.close}% to ${to}%`);
      ops.push(fieldOp(a, "stage", r.stage), fieldOp(a, "close", to));
      if (!text) words += ` Stage moved to ${r.stage}.`;
    }
    if (r && r.person && !a.people.some((p) => p.email === r.person.email)) {
      details.push(`Added ${r.person.name} (${r.person.title})`);
      ops.push({ type: "person", app: appId, item: { ...r.person, id: nextId("p"), isNew: true, contacted: `Email in, ${short(m.day)}` } });
    }
    if (r && r.next) {
      details.push(`Next step: ${r.next}, ${short(r.due)}`);
      ops.push(fieldOp(a, "next", r.next), fieldOp(a, "due", r.due));
    }
    if (!a.touch || m.day >= a.touch.day) ops.push(fieldOp(a, "touch", { kind: "Email", day: m.day }));
    return makeChange({
      appId, mail: m.id, what: `Linked an email: "${m.subject}"`, details, by, at, unsure: by === "app" && !(r && r.sure),
      why: r ? upper(r.why) : `You picked ${a.company}`, ops,
      notice: by === "app" ? null : { where: where || `company/${appId}`, text: words, open: where === "confirm" ? { href: `#/company/${appId}`, label: `Open ${a.company}` } : null },
    });
  }

  /** Make a new application (a lead, at stage New) from an email and link the email to it. */
  function createFromEmail(m, { company, role, by = "you", at = null, where = "confirm" }) {
    const s = S();
    const id = `${company.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${nextId("a")}`;
    const person = { id: nextId("p"), name: m.fromName, title: "Contact", email: m.fromEmail, contacted: `Email in, ${short(m.day)}`, isNew: true };
    const item = {
      id, company, role: role || "Role not known yet", pay: "Not known yet", payTop: 0, where: "Not known yet", whereKind: "Not known",
      size: "Not known yet", source: "Email", stage: "New", close: s.stageClose.New, lostReason: null, closedOn: null, reopenTo: null,
      touch: { kind: "Email", day: m.day }, next: `Reply to ${firstName(m.fromName)}`, due: nextDay(s.today), people: [person], timeline: [],
    };
    const why = m.reads && m.reads.lead ? upper(m.reads.why) : "You made a new lead from it";
    const ops = [
      { type: "app", item },
      { type: "link", app: id, mail: m.id, before: m.linkedTo, after: id },
      { type: "event", app: id, item: { id: nextId("e"), day: m.day, kind: "email", mail: m.id, text: `Email in from ${m.fromName}: "${m.subject}"`, justLinked: true, why: `Why linked: ${why.toLowerCase()}.` } },
    ];
    if (m.waiting) ops.push(mailOp(m, "waiting", false));
    return makeChange({
      appId: id, mail: m.id, what: `New lead: ${company}, ${item.role}`, details: [`Linked the email "${m.subject}"`, `Added ${m.fromName}`],
      why, by, at, unsure: by === "app", ops,
      notice: by === "app" ? null : { where, text: `Made ${company}, ${item.role} and linked the email.`, open: { href: `#/company/${id}`, label: `Open ${company}` } },
    });
  }

  /** Link an email where the app says it belongs: an application, or a new lead. */
  function linkAsRead(m, opts) {
    return m.reads && m.reads.lead ? createFromEmail(m, { ...m.reads.lead, ...opts }) : linkEmail(m.reads.app, m.id, opts);
  }

  /** Take an email off its application (its timeline item goes with it). */
  function unlinkEmail(mailId, where) {
    const m = mailById(mailId);
    const a = app(m.linkedTo);
    const ops = [{ type: "link", app: a.id, mail: m.id, before: a.id, after: null }];
    a.timeline.filter((e) => e.mail === m.id && e.kind === "email").forEach((e) => ops.push({ type: "event", app: a.id, item: clone(e), remove: true }));
    return makeChange({
      appId: a.id, mail: m.id, what: `Unlinked an email: "${m.subject}"`, why: "You unlinked it", ops,
      notice: { where, text: `Unlinked from ${a.company}.` },
    });
  }

  function setStage(a, stage, extra = {}) {
    const s = S();
    if (a.stage === stage) return null;
    const to = s.stageClose[stage];
    const ops = [fieldOp(a, "stage", stage), fieldOp(a, "close", to)];
    const details = [`Close: ${a.close}% to ${to}%`];
    if (stage === "Won" || stage === "Lost") {
      ops.push(fieldOp(a, "reopenTo", isOpen(a) ? a.stage : a.reopenTo), fieldOp(a, "closedOn", s.today), fieldOp(a, "next", ""), fieldOp(a, "due", ""));
      ops.push(fieldOp(a, "lostReason", stage === "Lost" ? extra.reason || "rejected" : null));
      if (a.next) details.push("Next step cleared");
    } else if (!isOpen(a)) {
      ops.push(fieldOp(a, "closedOn", null), fieldOp(a, "lostReason", null));
    }
    const words = stage === "Lost" ? `Lost, ${s.lostReasons[extra.reason || "rejected"].toLowerCase()}` : stage;
    ops.push({
      type: "event", app: a.id,
      item: { id: nextId("e"), day: s.today, kind: "stage", text: `Stage: ${a.stage} to ${words}, set by you`, detail: `${details.join(". ")}. You set it on the company page.` },
    });
    return makeChange({
      appId: a.id, what: `Stage: ${a.stage} to ${words}`, details, why: "You set it on the company page", ops,
      notice: { where: `company/${a.id}`, text: stage === "Lost" ? "Marked as lost." : stage === "Won" ? "Marked as won." : `Stage moved to ${stage}.` },
    });
  }

  /** The new mail of this morning, through the fork: linked by the app, or waiting in To confirm. */
  function readNewMail() {
    S().mail.filter((m) => m.incoming).forEach((m) => {
      if (asks(m)) m.waiting = true;
      else linkAsRead(m, { by: "app", at: "Oct 29, 07:30" });
    });
  }

  /** The notice after a change, with Undo, on the page it was made on. */
  function noticeBar(where) {
    const n = S().ui.notice;
    if (!n || n.where !== where) return "";
    return h`<p class="co-notice proto-notice" role="status"><span>${n.text}</span>${n.change ? h`<button class="btn btn-link" type="button" data-action="undo" data-arg="${n.change}">Undo</button>` : ""}${n.open ? h`<a class="cell-link" href="${n.open.href}">${n.open.label}</a>` : ""}<a class="cell-link" href="#/changes">See all changes</a></p>`;
  }

  /** Where Back goes from a person: the ?from= route, else the application. */
  function backOf(from, a) {
    const parts = (from || "").split("/");
    const c = parts[0] === "company" ? app(parts[1]) : null;
    if (c) return { href: `#/${from}`, label: parts[2] === "add-email" ? "Search your mail" : c.company };
    if (parts[0] === "changes") return { href: "#/changes", label: "Changes" };
    if (parts[0] === "confirm") return { href: "#/confirm", label: "To confirm" };
    if (parts[0] === "person" && personById(parts[1])) return { href: `#/${from}`, label: personById(parts[1]).p.name };
    return a ? { href: `#/company/${a.id}`, label: a.company } : { href: "#/jobs", label: "Applications" };
  }
  const backLink = (b) => h`<div class="co-top"><a class="co-back" href="${b.href}">${icon("back")}${b.label}</a></div>`;
  const notFound = (what) => shell("", h`${pageHeader(`No ${what} here`, "It may have been removed.")}<p><a class="cell-link" href="#/jobs">Back to Applications</a></p>`);

  // ---- An email, opened in place ----------------------------------------------------------------

  /** Which email a list shows open: the one Alex opened, else the one the address names (?open=). */
  function openIn(list, fallback) {
    const o = S().ui.openMail;
    return list in o ? o[list] : fallback || null;
  }
  /** A table row that opens its email in place, right under it (a second click closes it). */
  const mailRow = (list, m, open) => h` class="proto-row${open ? " is-selected" : ""}" data-action="toggleMail" data-arg="${list}|${m.id}" aria-expanded="${open ? "true" : "false"}"`;
  const mailToggle = (list, m, open) => h`<button type="button" class="proto-mail-btn" data-action="toggleMail" data-arg="${list}|${m.id}" aria-expanded="${open ? "true" : "false"}">${m.subject}</button>`;
  const detailRow = (cols, body) => h`<tr class="proto-mail-detail"><td class="wrap" colspan="${cols}"><div class="proto-mail-wrap">${body}</div></td></tr>`;

  /** The email: who, when, the whole text, the thread, where it is linked and why, and what you can do. */
  function mailCard(m, here, { actions = true } = {}) {
    const s = S();
    const a = m.linkedTo ? app(m.linkedTo) : null;
    const sender = personByEmail(m.fromEmail);
    const thread = s.mail.filter((x) => x.thread === m.thread && x.id !== m.id).sort(byTime);
    const personal = m.inbox === "Personal";
    return h`<div class="proto-mail-card">
<p class="proto-mail-subject">${m.subject}</p>
<dl class="co-glance proto-mail-meta">
<div><dt>From</dt><dd>${sender ? h`<a class="cell-link" href="#/person/${sender.p.id}?from=${here}">${m.fromName}</a>` : m.fromName} <span class="muted">${m.fromEmail}</span></dd></div>
<div><dt>To</dt><dd>Alex Morgan</dd></div>
<div><dt>Date</dt><dd>${longDate(m.day, m.time)}</dd></div>
<div><dt>Inbox</dt><dd>${personal ? "Personal (the app does not read it)" : "Work"}</dd></div>
</dl>
<div class="ml-text" tabindex="0" aria-label="Text of ${m.subject}">${m.text}</div>
${thread.length ? h`<p class="proto-mail-line"><span class="muted">Thread:</span> ${thread.map((x, i) => h`${i ? "; " : ""}${short(x.day)}, ${x.fromName}: ${x.subject} <span class="muted">(${x.linkedTo ? `on ${app(x.linkedTo).company}` : "not linked"})</span>`)}</p>` : ""}
<p class="proto-mail-line"><span class="muted">Linked to:</span> ${a ? h`<a class="cell-link" href="#/company/${a.id}">${a.company}, ${a.role}</a>` : m.waiting ? "not yet: it waits in To confirm" : "not linked"}</p>
${a && whyLinked(m) ? h`<p class="proto-mail-line"><span class="muted">Why linked:</span> ${whyLinked(m)}</p>` : ""}
${actions ? mailActions(m, here) : ""}
</div>`;
  }

  /** Unlink a linked email; attach one that is not (under B, "Link it?" first). */
  function mailActions(m, here) {
    const s = S();
    if (m.linkedTo) {
      return h`<div class="co-actions"><button class="btn btn-ghost" type="button" data-action="unlink" data-arg="${m.id}|${here}">Unlink from ${app(m.linkedTo).company}</button>${outLink("Open in Gmail", "btn btn-ghost")}</div>`;
    }
    const ask = s.ui.linkAsk;
    if (ask && ask.mail === m.id) return linkAskPanel(m, app(ask.app), here);
    const fromApp = here.startsWith("company/") ? here.split("/")[1] : null;
    const target = s.ui.attachTo[m.id] || (fromApp && app(fromApp) ? fromApp : null) || (m.reads && m.reads.app) || s.apps[0].id;
    return h`<form class="co-row proto-attach" data-action="attachMail" data-arg="${m.id}|${here}">
<div class="proto-pick">${field("Attach to", { id: `attach-to-${m.id}`, html: h`<select class="select" id="attach-to-${m.id}" name="app" data-change="pickAttach" data-arg="${m.id}">${appOptions(target)}</select>` })}</div>
<button class="btn btn-primary" type="submit">Attach</button>
${outLink("Open in Gmail", "btn btn-ghost")}
</form>`;
  }

  /** Option B's "Link it?": what linking will change, then Link it or Cancel. */
  const linkAskPanel = (m, a, here) => h`<div class="proto-ask" role="group" aria-label="Link it?">
<p><strong>Link it to ${a.company}, ${a.role}?</strong></p>
<p class="muted">${effects(m, a)}</p>
<div class="co-actions"><button class="btn btn-primary" type="button" data-action="linkAsked" data-arg="${m.id}|${a.id}|${here}">Link it</button><button class="btn btn-ghost" type="button" data-action="cancelAsk">Cancel</button></div>
</div>`;

  /** A list of emails that open in place (company Emails, a person's emails): the real ml-chain. */
  const mailChain = (mails, here, prefix, marks = () => "") => h`<ol class="ml-chain" aria-label="Emails, oldest first">
${mails.map((m) => h`<li>${fold(`${prefix}-${m.id}`, h`<span class="ml-when">${short(m.day)}</span> <span class="ml-who">From ${m.fromName}:</span> <span class="ml-subject">${m.subject}</span>${marks(m)}`, h`<div class="co-fold-body">${mailCard(m, here)}</div>`, " ml-email")}</li>`)}
</ol>`;

  // ---- Today (today/page.html) -----------------------------------------------------------------

  /** What the app did with this morning's mail, by the fork. */
  function mailLine() {
    const s = S();
    const fresh = s.mail.filter((m) => m.incoming);
    const linked = fresh.filter((m) => m.linkedTo && s.changes.some((c) => c.by === "app" && c.mail === m.id && c.state === "done")).length;
    const waiting = fresh.filter((m) => m.waiting && !m.linkedTo).length;
    return h`<p>${status("reading", `Mail read at 07:30: ${fresh.length} new emails about jobs.`)}${linked ? h`<a class="cell-link" href="#/changes">${linked} linked on their own</a>` : ""}${waiting ? h`<a class="cell-link" href="#/confirm">${waiting} to confirm</a>` : ""}</p>`;
  }

  P.screen("", () => {
    const s = S();
    const lines = todos();
    const n = lines.length;
    const heading = n === 0 ? "Nothing needs you today" : n === 1 ? "1 thing needs you today" : `${n} things need you today`;
    const open = s.apps.filter(isOpen);
    const jobs = { active: open.filter((a) => !["New", "Applied"].includes(a.stage)).length, prospect: open.filter((a) => a.stage === "Applied").length, due: n };
    const rows = lines.map((a) => {
      const late = overdue(a);
      const text = a.next + (late ? `, due ${short(a.due)}` : "");
      const who = a.people[0] ? a.people[0].name : a.role;
      return h`<tr data-company-id="${a.id}"${rowOpen(`#/company/${a.id}`)}>
${nameCell(a)}
${cap(who, "who", { cls: a.people[0] ? "" : "muted" })}
<td${on(late, 'class="late"')} title="${text}"><div class="cell-flex cap-flex cap-todo"><span class="cap-text">${text}</span>${late ? h` ${mark("Overdue")}` : ""}</div></td>
${cap("Job applications", "pipe", { cls: "muted" })}
${cap(a.stage, "status", { html: status(dotKind(a.stage), a.stage) })}
<td class="close-col">${closeBar(a.close)}</td>
</tr>`;
    });
    const pipeRow = (name, p, inside) => h`<tr>
<td>${inside ? h`<a class="cell-link" href="#/jobs">${name}</a>` : outLink(name, "cell-link")}</td>
<td><b>${p.active}</b></td>
<td>${p.prospect}</td>
<td>${p.contact}</td>
<td${on(p.due, 'class="late"')}>${p.due}</td>
<td>${p.meetings}</td>
<td>${p.contacted}</td>
<td>${p.replied}</td>
<td>${p.rate}</td>
</tr>`;
    return shell("today", h`
${pageHeader(heading, "Closest to closing first. Click a company to open it.", s.todayLong)}
<section class="jobs-line" aria-label="Mail and jobs">
${mailLine()}
<p>${status("off", "No jobs running or queued.")}${outLink("Open Jobs", "cell-link")}</p>
</section>
<div class="list-split list-split-today"><div class="split"><div class="split-main"><div id="today-todos">
${n ? grid({ columns: ["Company", "Contact", "To do", "Pipeline", "Status", "Close"], label: "To do", pin: true, rows })
    : emptyState("Nothing due today.", "Leads with a next step due today or earlier show here.")}
</div></div><div class="split-side" id="panel-slot"></div></div></div>
<section class="stack" id="today-pipelines">
<h2 class="section-title" id="pipelines-h">Pipelines</h2>
${grid({
    columns: ["Pipeline", "Active", "Prospect", "Contact", "Due today", "Meetings this week", "Contacted, 30 days", "Replied", "Reply rate"],
    label: "Pipelines", pin: true,
    rows: [
      ...s.otherPipelines.map((p) => pipeRow(p.name, { ...p, due: 0 }, false)),
      pipeRow("Job applications", { ...s.jobsNumbers, ...jobs, contact: open.filter((a) => a.stage === "New").length }, true),
    ],
  })}
</section>`);
  });

  // ---- Applications (pipeline/page.html, _table.html, _filters.html) ---------------------------

  const AZ = ["Sort A to Z", "Sort Z to A"];
  const BUCKETS = [["overdue", "Overdue"], ["today", "Due today"], ["later", "Later"], ["none", "No date"]];
  const COLS = [
    { key: "name", label: "Company", kind: "text", words: AZ, sort: (a) => a.company.toLowerCase(), text: (a) => a.company },
    { key: "who", label: "Role", kind: "text", words: AZ, sort: (a) => a.role.toLowerCase(), text: (a) => a.role },
    {
      key: "stage", label: "Stage", kind: "pick", words: ["Earliest first", "Furthest first"],
      sort: (a) => (a.stage === "Lost" ? -2 : rank(a.stage)), value: (a) => a.stage, order: () => ["New", ...S().stages, "Won", "Lost"],
    },
    { key: "close", label: "Close", kind: "", words: ["Lowest first", "Highest first"], sort: (a) => a.close },
    { key: "pay", label: "Pay", kind: "", words: ["Lowest first", "Highest first"], sort: (a) => a.payTop },
    { key: "where", label: "Where", kind: "pick", words: AZ, sort: (a) => a.where.toLowerCase(), value: (a) => a.whereKind, order: () => ["Remote", "Hybrid", "On-site", "Not known"] },
    { key: "source", label: "Source", kind: "pick", words: AZ, sort: (a) => a.source.toLowerCase(), value: (a) => a.source, order: () => ["LinkedIn", "Referral", "Topgig", "Welljobs", "Email"] },
    {
      key: "touch", label: "Last touch", kind: "pick", words: ["Oldest first", "Newest first"],
      sort: (a) => (a.touch ? a.touch.day : ""), value: (a) => (a.touch ? a.touch.kind : "Nothing yet"),
      order: () => ["Applied", "Email", "Call", "Interview", "Nothing yet"],
    },
    {
      key: "step", label: "Next step", kind: "pick", words: ["Soonest first", "Latest first"], sort: (a) => a.due || null,
      value: (a) => (!a.due ? "none" : a.due < S().today ? "overdue" : a.due === S().today ? "today" : "later"),
      order: () => BUCKETS.map((b) => b[0]), labelOf: (v) => (BUCKETS.find((b) => b[0] === v) || [v, v])[1],
    },
  ];
  const col = (key) => COLS.find((c) => c.key === key);
  const optLabel = (c, v) => (c.labelOf ? c.labelOf(v) : v);
  const tabOf = (a) => (a.stage === "Lost" ? "lost" : a.stage === "Won" ? "won" : "open");

  function searchHit(a, q) {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const hay = [a.company, a.role, ...a.people.map((p) => p.name)].join(" ").toLowerCase();
    return words.every((w) => hay.includes(w));
  }
  function passes(c, a, t) {
    if (c.kind === "text" && t.text[c.key]) return c.text(a).toLowerCase().includes(t.text[c.key].trim().toLowerCase());
    if (c.kind === "pick" && t.picks[c.key] && t.picks[c.key].length) return t.picks[c.key].includes(c.value(a));
    return true;
  }
  /** The tab's rows that pass the search and every column filter but one (skip: for a menu's counts). */
  function filtered(skip) {
    const t = S().table;
    return S().apps.filter((a) => tabOf(a) === t.tab && (!t.q.trim() || searchHit(a, t.q)) && COLS.every((c) => c.key === skip || passes(c, a, t)));
  }
  function sortDir(key) {
    const t = S().table;
    if (t.sort) return t.sort === key ? t.dir : null;
    return key === "close" && t.tab === "open" ? "desc" : null;
  }
  function sorted(rows) {
    const t = S().table;
    const c = col(t.sort || "close");
    const dir = t.sort ? t.dir : "desc";
    return [...rows].sort((a, b) => {
      const x = c.sort(a);
      const y = c.sort(b);
      if (x == null || y == null) return (x == null) - (y == null) || a.company.localeCompare(b.company);
      const d = x < y ? -1 : x > y ? 1 : 0;
      return (dir === "desc" ? -d : d) || a.company.localeCompare(b.company);
    });
  }
  function chips() {
    const t = S().table;
    const found = [];
    if (t.q.trim()) found.push({ key: "q", label: `Search: ${t.q.trim()}` });
    COLS.forEach((c) => {
      if (c.kind === "text" && t.text[c.key] && t.text[c.key].trim()) found.push({ key: c.key, label: `${c.label}: ${t.text[c.key].trim()}` });
      if (c.kind === "pick" && t.picks[c.key] && t.picks[c.key].length) {
        found.push({ key: c.key, label: `${c.label}: ${t.picks[c.key].map((v) => optLabel(c, v)).join(", ")}` });
      }
    });
    return found;
  }
  const isFiltered = (key) => {
    const t = S().table;
    return !!((t.text[key] && t.text[key].trim()) || (t.picks[key] && t.picks[key].length));
  };

  /** A header: the button that opens its column menu (pipeline/_filters.html header()). */
  function header(key, n) {
    const c = col(key);
    const dir = sortDir(key);
    const open = S().ui.menu === key;
    return h`<button type="button" class="th-btn${isFiltered(key) ? " th-on" : ""}" id="th-${key}-${n}" aria-haspopup="dialog" aria-expanded="${open ? "true" : "false"}" aria-controls="colmenu-${key}" data-colmenu="${key}" data-action="colMenu" data-arg="${key}">${c.label}${dir ? h`<span class="sort-mark${dir === "asc" ? " sort-up" : ""}" role="img" aria-label="sorted, ${(dir === "desc" ? c.words[1] : c.words[0]).toLowerCase()}">${icon("sort-desc", 10)}</span>` : ""}<span class="th-caret" aria-hidden="true"></span></button>`;
  }

  /** The open column menu: sort, then the values with counts (pick) or a Contains box (text). */
  function menu() {
    const key = S().ui.menu;
    const c = key && col(key);
    if (!c) return "";
    const t = S().table;
    const dir = sortDir(key);
    const sortItem = (d, words) => h`<a class="col-menu-item" href="#/jobs" id="sort-${key}-${d}" data-action="sortBy" data-arg="${key}:${d}"${on(dir === d, 'aria-current="true"')}><span class="col-box col-tick" aria-hidden="true">${dir === d ? icon("check", 14) : ""}</span>${words}</a>`;
    let body = "";
    if (c.kind === "pick") {
      const base = filtered(key);
      const inTab = S().apps.filter((a) => tabOf(a) === t.tab).map(c.value);
      const picked = t.picks[key] || [];
      const values = c.order().filter((v) => inTab.includes(v) || picked.includes(v));
      body = h`<div class="col-menu-picks" role="group" aria-label="Show only">
${values.length ? values.map((v, i) => {
        const yes = picked.includes(v);
        return h`<a class="col-menu-item" role="checkbox" aria-checked="${yes ? "true" : "false"}" href="#/jobs" id="pick-${key}-${i}" data-action="togglePick" data-arg="${key}|${v}" data-value="${v}"><span class="col-box" aria-hidden="true">${yes ? icon("check", 14) : ""}</span><span class="col-label">${optLabel(c, v)}</span> <span class="col-n">${base.filter((a) => c.value(a) === v).length}</span></a>`;
      }) : h`<p class="col-menu-none">Nothing to pick here.</p>`}
</div>`;
    } else if (c.kind === "text") {
      body = h`<form class="col-menu-text" data-action="keepMenu">
<label class="field-label" for="colmenu-${key}-text">Contains</label>
<input class="input" id="colmenu-${key}-text" type="search" name="${key}" value="${t.text[key] || ""}" autocomplete="off" maxlength="100" data-input="setText" data-arg="${key}">
</form>`;
    }
    return h`<div class="col-menus"><div class="col-menu" id="colmenu-${key}" role="dialog" aria-label="${c.label}: sort and filter" data-colmenu-for="${key}">
<div class="col-menu-head"><span>${c.label}</span><button class="btn-icon" type="button" aria-label="Close menu" title="Close menu" data-action="closeMenu">${icon("close")}</button></div>
<div class="col-menu-sorts" id="colmenu-${key}-sorts">${sortItem("asc", c.words[0])}${sortItem("desc", c.words[1])}</div>
${body}
</div></div>`;
  }

  P.screen("jobs", () => {
    const s = S();
    const t = s.table;
    const total = s.apps.filter((a) => tabOf(a) === t.tab).length;
    const rows = sorted(filtered(null));
    const found = chips();
    const count = (k) => s.apps.filter((a) => tabOf(a) === k).length;
    const tabs = [["open", "All"], ["lost", "Lost"], ["won", "Won"]].filter(([k]) => k === "open" || k === t.tab || count(k) > 0);
    const c = col(t.sort || "close");
    const footer = (t.sort ? `Sorted by ${c.label.toLowerCase()}, ${(t.dir === "desc" ? c.words[1] : c.words[0]).toLowerCase()}.` : "Closest to closing first.") +
      " Click a company to open it.";
    const heads = ["name", "who", "stage", "close", "who", "pay", "where", "source", "touch", "step"].map((k, i) => header(k, i));
    const lines = rows.map((a) => {
      const late = overdue(a);
      return h`<tr data-company-id="${a.id}"${rowOpen(`#/company/${a.id}`)}>
${nameCell(a)}
${cap(a.role, "who")}
${cap(stageText(a), "status", { html: status(dotKind(a.stage), stageText(a)) })}
<td class="close-col">${closeBar(a.close)}</td>
${cap(a.role, "who")}
${cap(a.pay, "pay")}
${cap(a.where, "where")}
${cap(a.source, "src")}
${cap(touchText(a), "touch", { cls: a.touch ? "" : "notyet" })}
${cap(stepText(a), "step", { cls: late ? "late" : "", sr: late ? "Overdue: " : null })}
</tr>`;
    });
    let table;
    if (rows.length) table = h`${grid({ columns: heads, label: "Applications", pin: true, footer, rows: lines })}${menu()}`;
    else if (found.length) table = h`${emptyState("Nothing matches these filters.", "Remove a filter above, or clear them all.")}${menu()}`;
    else if (t.tab === "lost") table = emptyState("Nothing lost here.", "Applications that said no, never replied or were dropped show here.");
    else if (t.tab === "won") table = emptyState("Nothing won yet.");
    else table = emptyState("No job applications here yet.", "Add a job, or read your applications from your email.");
    return shell("jobs", h`
${pageHeader("Job applications", "Jobs you found, and applications read from your email.", null, h`${outLink("Find new", "btn btn-ghost")}
<a class="btn btn-primary" href="#" data-out="app">${icon("plus", 16)}Add a job</a>`)}
<div id="pipeline-tabs" class="tab-row">
<nav class="tabs" aria-label="Filter">${tabs.map(([k, label]) => h`<a class="tab" href="#/jobs" data-action="setTab" data-arg="${k}"${on(t.tab === k, 'aria-current="page"')}>${label} <span class="count">${count(k)}</span></a>`)}</nav>
</div>
<div class="table-tools">
<form class="table-search" role="search" aria-label="Search this table" data-action="keepMenu">
<label class="sr-only" for="table-q">Search</label>
<input class="input" id="table-q" type="search" name="q" value="${t.q}" placeholder="Search company, role, person" autocomplete="off" maxlength="100" data-input="search">
</form>
<div id="table-chips" class="table-chips">
${found.map((f) => h`<a class="filter-chip" href="#/jobs" data-action="removeChip" data-arg="${f.key}" aria-label="Remove filter ${f.label}"><span>${f.label}</span>${icon("close", 14)}</a>`)}
${found.length ? h`<button class="btn btn-link" type="button" data-action="clearFilters">Clear</button>` : ""}
<span class="table-count">${found.length ? `${rows.length} of ${total}` : `${total} shown`}</span>
</div>
</div>
<div class="list-split list-split-pipeline"><div class="split"><div class="split-main"><div id="pipeline-table" class="lead-table proto-jobs">
${table}
</div></div><div class="split-side" id="panel-slot"></div></div></div>`);
  });

  // ---- Company page (company/_page.html) --------------------------------------------------------

  function stageBlock(a) {
    const s = S();
    if (!isOpen(a)) {
      const words = a.stage === "Lost" ? `Lost, ${s.lostReasons[a.lostReason] || "Rejected"}` : "Won";
      return h`<div class="co-stage proto-stage" id="co-stage">
<div class="steps" role="group" aria-label="Stage"><p class="steps-lost${a.stage === "Won" ? " proto-won" : ""}">${words}${a.closedOn ? `, ${short(a.closedOn)}` : ""}</p></div>
<div class="co-actions"><button class="btn btn-ghost" type="button" data-action="reopen" data-arg="${a.id}">Reopen</button></div>
</div>`;
    }
    const now = rank(a.stage);
    const steps = h`<div class="steps" role="group" aria-label="Stage">${s.stages.map((name, i) => (i === now
      ? h`<span class="step step-now" aria-current="step">${name}</span>`
      : h`<button type="button" class="step${i < now ? " step-done" : ""}" data-action="setStage" data-arg="${a.id}|${name}">${name}</button>`))}</div>`;
    const body = h`<div class="co-fold-body">
<form class="co-row" data-action="markLost" data-arg="${a.id}">
<fieldset class="chips">
<legend>Lost because</legend>
<div class="chip-row">${Object.entries(s.lostReasons).map(([k, label]) => h`<label class="chip"><input type="radio" name="reason" value="${k}" data-change="pickReason"${on(s.ui.lostReason === k, "checked")}><span>${label}</span></label>`)}</div>
</fieldset>
<button class="btn btn-ghost" type="submit">Mark as lost</button>
<button class="btn btn-ghost" type="button" data-action="setStage" data-arg="${a.id}|Won">Mark as won</button>
</form>
<form class="co-row" data-action="saveClose" data-arg="${a.id}">
${field("Close %", { id: `close-pct-${a.id}`, html: h`<input class="input" id="close-pct-${a.id}" name="close_pct" type="text" value="${a.close}" inputmode="numeric">` }, null, s.ui.err.close)}
<button class="btn btn-ghost" type="submit">Save close %</button>
</form>
</div>`;
    return h`<div class="co-stage proto-stage" id="co-stage">
${steps}
${fold(`fold-stage-${a.id}`, "Won, lost or close %", body)}
</div>`;
  }

  function nextBlock(a) {
    const s = S();
    if (!isOpen(a)) return h`<div class="co-nextbar"><span><span class="muted">Next:</span> <strong>Nothing, the application is closed.</strong></span></div>`;
    const editing = s.ui.nextOpen === a.id;
    const bar = h`<div class="co-nextbar"><span><span class="muted">Next:</span> <strong>${a.next || "No next step yet"}</strong>${a.due ? h` <span class="${overdue(a) ? "late" : "muted"}">(${dueWord(a)})</span>` : ""}</span>
${editing ? "" : h`<button class="btn btn-primary" type="button" data-action="editNext" data-arg="${a.id}">Change next step</button>`}</div>`;
    if (!editing) return bar;
    return h`${bar}
<form class="next-box proto-next-form" data-action="saveNext" data-arg="${a.id}">
<div class="co-row">
${field("Next step", { id: "next-step", html: h`<input class="input" id="next-step" name="next" type="text" value="${a.next}" maxlength="120"${on(s.ui.err.next, 'aria-invalid="true"')}>` }, null, s.ui.err.next)}
${field("Due", { id: "next-due", html: h`<input class="input" id="next-due" name="due" type="date" value="${a.due}">` })}
<div class="co-actions"><button class="btn btn-primary" type="submit">Save next step</button><button class="btn btn-ghost" type="button" data-action="cancelNext">Cancel</button></div>
</div>
</form>`;
  }

  /** What the app changed on its own from email, until Alex says it looks right (company/_mail_notes.html):
      Undo, Looks right, Open email (in place) and Wrong application. */
  function mailNotes(a, here) {
    const notes = S().changes.filter((c) => c.by === "app" && c.app === a.id && c.state === "done" && !c.ok);
    if (!notes.length) return "";
    return h`<section class="ml-notes" aria-label="Changes from email">
${notes.map((c) => {
    const m = c.mail ? mailById(c.mail) : null;
    const linked = c.ops.some((op) => op.type === "link");
    const lead = c.ops.some((op) => op.type === "app");
    const words = m && lead ? `made this lead from ${m.fromName}'s email "${m.subject}"` : m && linked ? `linked ${m.fromName}'s email "${m.subject}"` : c.what.toLowerCase();
    return h`<div class="ml-note${c.unsure ? " ml-wait" : ""}" role="group" aria-label="Changed by email: ${words}">
<p><strong>Changed by email:</strong> ${words}.${c.details.length && !lead ? ` ${c.details.join(". ")}.` : ""}${c.unsure ? h` ${mark("Unsure", "warn", c.why)}` : ""} <span class="muted">${c.at}</span></p>
<p class="muted">Why: ${c.why}.</p>
<div class="co-actions">
${canUndo(c) ? h`<button class="btn btn-ghost" type="button" data-action="undoNote" data-arg="${c.id}|${here}" aria-label="Undo: ${c.what}">Undo</button>` : ""}
<button class="btn btn-ghost" type="button" data-action="noteOk" data-arg="${c.id}" aria-label="Looks right: ${c.what}">Looks right</button>
</div>
${m ? fold(`note-mail-${c.id}`, "Open email", h`<div class="co-fold-body">${mailCard(m, here, { actions: false })}</div>`) : ""}
${m && linked && canUndo(c) ? fold(`note-move-${c.id}`, "Wrong application", h`<form class="co-fold-body co-row" data-action="moveNote" data-arg="${c.id}">
${field("Move this email to", { id: `move-${c.id}`, html: h`<select class="select" id="move-${c.id}" name="to" data-change="pickMove">${appOptions(S().ui.moveTo || S().apps.find((x) => x.id !== a.id).id)}</select>` })}
<button class="btn btn-ghost" type="submit">Move it</button>
</form>`) : ""}
</div>`;
  })}
</section>`;
  }

  /** One timeline item, unfolding in place: an email to the email itself; a call, an application or a
      stage change to its notes. */
  function timelineItem(a, e, here) {
    const m = e.kind === "email" && e.mail ? mailById(e.mail) : null;
    if (m) {
      return fold(`tl-${e.id}`, h`${e.text}${e.justLinked ? h` ${mark("Just linked", "good")}` : ""}`,
        h`<div class="co-fold-body proto-tl-body">${e.why ? h`<p class="proto-why">${e.why}</p>` : ""}${mailCard(m, here)}</div>`, " proto-fold");
    }
    const who = e.who && a.people.find((p) => p.id === e.who);
    const conf = e.mail ? mailById(e.mail) : null;
    const body = h`<div class="co-fold-body proto-tl-body">
<p>${e.detail || "No notes."}</p>
${who ? h`<p><span class="muted">With</span> <a class="cell-link" href="#/person/${who.id}?from=${here}">${who.name}</a><span class="muted">, ${who.title.toLowerCase()}</span></p>` : ""}
${conf ? fold(`tl-conf-${e.id}`, "The confirmation email", h`<div class="co-fold-body">${mailCard(conf, here)}</div>`) : ""}
${e.kind === "stage" ? h`<p><a class="cell-link" href="#/changes">See it in Changes</a></p>` : ""}
</div>`;
    return fold(`tl-${e.id}`, e.text, body, " proto-fold");
  }

  P.screen("company/:id", ({ id }) => {
    const s = S();
    const a = app(id);
    if (!a) return notFound("company");
    const here = `company/${id}`;
    const events = [...a.timeline].sort(newestFirst);
    const emails = s.mail.filter((m) => m.linkedTo === id).sort(byTime);
    const fresh = new Set(a.timeline.filter((e) => e.justLinked).map((e) => e.mail));
    return shell("jobs", h`<div class="co-page" id="co-page">
<div class="co-top">
<a class="co-back" href="#/jobs">${icon("back")}Back to Applications</a>
<a class="btn btn-ghost" href="#/company/${id}/add-email">${icon("plus", 16)}Add missing email</a>
</div>
${noticeBar(here)}
<header class="co-head">
<div class="co-head-text">
<h1>${a.company}</h1>
<p class="co-sub">${a.role}.</p>
<dl class="co-glance" aria-label="${a.company} at a glance">
<div><dt>Where</dt><dd>${a.where}</dd></div>
<div><dt>Pay</dt><dd>${a.pay}</dd></div>
<div><dt>Size</dt><dd>${a.size}</dd></div>
<div><dt>Source</dt><dd>${a.source}</dd></div>
</dl>
</div>
<div class="co-head-stage proto-head-stage">
${stageBlock(a)}
<span class="co-close"><b>${a.close}%</b><small>to close</small></span>
</div>
</header>
${mailNotes(a, here)}
<p class="co-touch"><span class="muted">Last touch:</span> ${a.touch ? h`${a.touch.kind}, ${short(a.touch.day)}.` : h`<span class="notyet">Nothing yet</span>`}</p>
${nextBlock(a)}
<div class="co-cols">
<div class="co-left">
<section class="co-sec" aria-labelledby="co-time-h">
<h2 class="co-h2" id="co-time-h">Timeline</h2>
${events.length ? grid({
    label: `Timeline of ${a.company}`, wrap: true,
    rows: events.map((e) => h`<tr><td class="co-day">${short(e.day)}</td><td class="proto-tl-cell">${timelineItem(a, e, here)}</td></tr>`),
  }) : h`<p class="muted">Nothing yet.</p>`}
</section>
</div>
<div class="co-right">
<section class="co-sec" aria-labelledby="co-ppl-h">
<h2 class="co-h2" id="co-ppl-h">People</h2>
${a.people.length ? grid({
    columns: ["Name", "Role", "Contacted", "Email"], label: `People at ${a.company}`,
    rows: a.people.map((p) => h`<tr${rowOpen(`#/person/${p.id}?from=${here}`)}>
<td><a class="cell-link" href="#/person/${p.id}?from=${here}">${p.name}</a>${p.isNew ? h` ${mark("New", "good")}` : ""}</td>
<td>${p.title}</td>
<td class="${p.contacted ? "yes" : "notyet"}">${p.contacted || "Not yet"}</td>
<td>${p.email}</td>
</tr>`),
  }) : h`<p class="muted">No people yet.</p>`}
</section>
<section class="co-sec" aria-labelledby="co-mail-h">
<h2 class="co-h2" id="co-mail-h">Emails (${emails.length})</h2>
${emails.length ? mailChain(emails, here, "em", (m) => (fresh.has(m.id) ? h` ${mark("Just linked", "good")}` : "")) : h`<p class="muted">No emails on this application yet.</p>`}
<p class="proto-missing muted">Missing one? <a class="cell-link" href="#/company/${id}/add-email">Add missing email</a></p>
</section>
</div>
</div>
</div>`);
  });

  // ---- A person (#/person/<id>) ----------------------------------------------------------------

  P.screen("person/:id", ({ id }, query) => {
    const s = S();
    const found = personById(id);
    if (!found) return notFound("person");
    const { a, p } = found;
    const here = `person/${id}`;
    const mails = s.mail.filter((m) => m.fromEmail.toLowerCase() === p.email.toLowerCase()).sort(byTime);
    const calls = a.timeline.filter((e) => e.who === p.id).sort(newestFirst);
    const added = p.isNew ? s.changes.find((c) => c.state === "done" && c.ops.some((op) => (op.type === "person" && op.item.id === p.id) || (op.type === "app" && op.item.id === a.id))) : null;
    return shell("jobs", h`<div class="co-page">
${backLink(backOf(query.from, a))}
${noticeBar(here)}
${pageHeader(p.name, `${p.title} at ${a.company}.`, `${a.company}, ${a.role}`)}
<dl class="co-glance" aria-label="${p.name}">
<div><dt>Email</dt><dd>${p.email}</dd></div>
<div><dt>Contacted</dt><dd>${p.contacted || "Not yet"}</dd></div>
<div><dt>Application</dt><dd><a class="cell-link" href="#/company/${a.id}">${a.company}</a></dd></div>
</dl>
${added ? h`<p class="co-notice proto-notice"><span>New: added from an email, ${added.at}.</span><a class="cell-link" href="#/changes">See it in Changes</a></p>` : ""}
<section class="co-sec" aria-labelledby="pp-mail-h">
<h2 class="co-h2" id="pp-mail-h">Emails from ${firstName(p.name)} (${mails.length})</h2>
${mails.length ? mailChain(mails, here, "pm", (m) => (m.linkedTo ? "" : h` ${mark("Not linked", "warn")}`)) : h`<p class="muted">No emails from ${p.name} yet.</p>`}
</section>
<section class="co-sec" aria-labelledby="pp-call-h">
<h2 class="co-h2" id="pp-call-h">Calls and meetings (${calls.length})</h2>
${calls.length ? grid({
    label: `Calls with ${p.name}`, wrap: true,
    rows: calls.map((e) => h`<tr><td class="co-day">${short(e.day)}</td><td class="proto-tl-cell">${fold(`pc-${e.id}`, e.text, h`<div class="co-fold-body proto-tl-body"><p>${e.detail}</p></div>`, " proto-fold")}</td></tr>`),
  }) : h`<p class="muted">No calls or meetings with ${p.name} yet.</p>`}
</section>
</div>`);
  });

  // ---- Add missing email: search your mail ------------------------------------------------------

  function matchOf(m, id) {
    if (m.linkedTo === id) return { text: "Already linked", tone: "muted", linked: true };
    if (m.linkedTo) return { text: `On ${app(m.linkedTo).company}`, tone: "muted", linked: true };
    const threads = S().mail.filter((x) => x.linkedTo === id).map((x) => x.thread);
    if (threads.includes(m.thread)) return { text: "Same thread", tone: "good" };
    if (m.reads && m.reads.app === id) return { text: `Names ${app(id).company}`, tone: "good" };
    return { text: "No match", tone: "muted" };
  }
  function mailHit(m, q) {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const hay = [m.fromName, m.fromEmail, m.subject, m.text].join(" ").toLowerCase();
    return words.every((w) => hay.includes(w));
  }

  P.screen("company/:id/add-email", ({ id }, query) => {
    const s = S();
    const a = app(id);
    if (!a) return notFound("company");
    const here = `company/${id}/add-email`;
    const q = s.ui.mailQ[id] != null ? s.ui.mailQ[id] : a.company;
    const found = s.mail.filter((m) => mailHit(m, q)).sort((x, y) => byTime(y, x));
    const open = openIn("search", query.open);
    const ask = s.ui.linkAsk;
    const rows = found.map((m) => {
      const match = matchOf(m, id);
      const isOpenRow = open === m.id || (ask && ask.mail === m.id);
      return h`<tr${mailRow("search", m, isOpenRow)}>
<td>${m.fromName}${m.inbox === "Personal" ? h`<span class="proto-sub">Personal inbox</span>` : ""}</td>
<td class="proto-subject">${mailToggle("search", m, isOpenRow)}</td>
<td>${short(m.day)}</td>
<td>${mark(match.text, match.tone)}${m.waiting ? h` ${mark("In To confirm", "info")}` : ""}</td>
<td>${match.linked ? h`<span class="muted">Linked</span>` : h`<button class="btn btn-link" type="button" data-action="attach" data-arg="${id}|${m.id}" aria-label="Attach ${m.subject} from ${m.fromName}">Attach</button>`}</td>
</tr>${isOpenRow ? detailRow(5, ask && ask.mail === m.id ? linkAskPanel(m, app(ask.app), here) : h`${mailCard(m, here, { actions: false })}${match.linked ? "" : h`<div class="co-actions proto-card-actions"><button class="btn btn-primary" type="button" data-action="attach" data-arg="${id}|${m.id}">Attach to ${a.company}</button></div>`}`) : ""}`;
    });
    return shell("jobs", h`<div class="co-page">
${backLink({ href: `#/company/${id}`, label: a.company })}
${pageHeader("Add a missing email", "Search your mail, including the inboxes the app does not read. Attach the one it missed: it reads it and updates the application.", `${a.company}, ${a.role}`)}
<form class="proto-search" role="search" data-action="keepMenu">
${field("Search your mail", { id: "mail-q", html: h`<input class="input" id="mail-q" type="search" name="q" value="${q}" autocomplete="off" maxlength="100" data-input="mailSearch" data-arg="${id}">` }, "From, subject or words in the email.")}
</form>
<p class="muted">${found.length === 1 ? "1 email matches." : `${found.length} emails match.`} Click one to read it here.</p>
${found.length ? grid({ columns: ["From", "Subject", "Date", "Match", h`<span class="sr-only">Attach</span>`], label: "Emails found", rows })
    : emptyState("No email matches.", "Try the sender's name, or fewer words.")}
</div>`);
  });

  // ---- To confirm (options B and C) -------------------------------------------------------------

  /** What the app thinks an email is about: an application, or a new lead. */
  function guessOf(m) {
    const r = m.reads || {};
    if (r.lead) return h`<span class="proto-guess">New lead: ${r.lead.company}, ${r.lead.role}</span> ${mark("New company", "info")}`;
    const a = app(r.app);
    return h`<span class="proto-guess">${a.company}, ${a.role}</span> ${r.sure ? mark("Sure", "good") : mark("Unsure", "warn")}`;
  }

  /** "Not this one": another application, a new lead, or not relevant. */
  function pickPanel(m) {
    const s = S();
    const r = m.reads || {};
    const to = s.ui.pickTo[m.id] || (r.lead ? "new" : s.apps.find((x) => x.id !== r.app).id);
    const err = s.ui.err.pick;
    return h`<form class="proto-pick-panel co-row" data-action="pickLink" data-arg="${m.id}" aria-label="Where it belongs">
${field("Belongs to", { id: `pick-to-${m.id}`, html: h`<select class="select" id="pick-to-${m.id}" name="to" data-change="pickTo" data-arg="${m.id}">${appOptions(to, h`<option value="new"${on(to === "new", "selected")}>A new lead</option>`)}</select>` })}
${to === "new" ? h`${field("Company", { id: `pick-co-${m.id}`, html: h`<input class="input" id="pick-co-${m.id}" name="company" type="text" value="${r.lead ? r.lead.company : ""}" maxlength="80"${on(err, 'aria-invalid="true"')}>` }, null, err)}
${field("Role", { id: `pick-role-${m.id}`, html: h`<input class="input" id="pick-role-${m.id}" name="role" type="text" value="${r.lead ? r.lead.role : ""}" maxlength="80" placeholder="Not known yet">` })}` : ""}
<div class="co-actions">
<button class="btn btn-primary" type="submit">${to === "new" ? "Make the lead and link" : "Link it"}</button>
<button class="btn btn-ghost" type="button" data-action="notRelevant" data-arg="${m.id}">Not relevant</button>
<button class="btn btn-ghost" type="button" data-action="cancelPick">Cancel</button>
</div>
</form>`;
  }

  P.screen("confirm", (_, query) => {
    const s = S();
    const list = toConfirm();
    const open = openIn("confirm", query.open);
    const rows = list.map((m) => {
      const picking = s.ui.pick === m.id;
      const isOpenRow = open === m.id || picking;
      return h`<tr${mailRow("confirm", m, isOpenRow)}>
<td>${m.fromName}</td>
<td class="proto-subject">${mailToggle("confirm", m, isOpenRow)}</td>
<td>${short(m.day)}</td>
<td class="wrap proto-guess-cell">${guessOf(m)}<span class="proto-sub">${upper(m.reads.why)}.</span></td>
<td><div class="cell-flex"><button class="btn btn-link" type="button" data-action="confirm" data-arg="${m.id}" aria-label="Confirm: ${m.subject}">Confirm</button><button class="btn btn-link" type="button" data-action="notThis" data-arg="${m.id}" aria-label="Not this one: ${m.subject}">Not this one</button></div></td>
</tr>${isOpenRow ? detailRow(5, picking ? pickPanel(m) : h`${mailCard(m, "confirm", { actions: false })}<div class="co-actions proto-card-actions"><button class="btn btn-primary" type="button" data-action="confirm" data-arg="${m.id}">Confirm</button><button class="btn btn-ghost" type="button" data-action="notThis" data-arg="${m.id}">Not this one</button></div>`) : ""}`;
    });
    const sub = mode() === "A" ? "The app links the emails it matches on its own, so nothing waits here."
      : mode() === "B" ? "The app found where these emails belong. Nothing is linked until you confirm."
      : "The app linked the emails it was sure about. These it was not sure about.";
    return shell("confirm", h`
${pageHeader("To confirm", sub)}
${noticeBar("confirm")}
${list.length ? grid({ columns: ["From", "Subject", "Date", "The app thinks", h`<span class="sr-only">Actions</span>`], label: "Emails to confirm", footer: "Click an email to read it here.", rows })
    : emptyState("Nothing to confirm.", "New mail the app is not sure about waits here.")}`);
  });

  // ---- Changes (like mail/updates.html) ---------------------------------------------------------

  P.screen("changes", () => {
    const s = S();
    const open = openIn("changes");
    const rows = s.changes.map((c) => {
      const a = c.app ? app(c.app) : null;
      const where = a ? h`<a class="cell-link" href="#/company/${a.id}">${a.company}</a>` : h`<span class="muted">${c.appName ? `${c.appName} (removed)` : "None"}</span>`;
      const state = c.state === "undone" ? mark("Undone", "muted")
        : canUndo(c) ? h`<button class="btn btn-link" type="button" data-action="undo" data-arg="${c.id}" aria-label="Undo: ${a ? a.company : "email"}, ${c.what}">Undo</button>`
        : h`<span class="muted">Changed again since</span>`;
      const m = c.mail ? mailById(c.mail) : null;
      const shown = open === c.id;
      return h`<tr${on(c.state === "undone", 'class="proto-undone"')}>
<td class="proto-when">${c.at}${c.isNew ? h`<div>${mark("New", "good")}</div>` : ""}</td>
<td class="proto-what"><strong>${c.what}</strong>${c.unsure ? h` ${mark("Unsure", "warn")}` : ""}${c.details.length ? h`<ul class="proto-details">${c.details.map((d) => h`<li>${d}</li>`)}</ul>` : ""}${m ? h`<button class="btn btn-link proto-show" type="button" data-action="toggleMail" data-arg="changes|${c.id}" aria-expanded="${shown ? "true" : "false"}">${shown ? "Hide the email" : "Show the email"}</button>` : ""}</td>
<td>${where}</td>
<td class="proto-whycol">${c.why}</td>
<td>${c.by === "app" ? mark("App", "info") : mark("You", "muted")}</td>
<td>${state}</td>
</tr>${shown && m ? detailRow(6, mailCard(m, "changes")) : ""}`;
    });
    return shell("changes", h`
${pageHeader("Changes", "Every change the app or you made, newest first. Undo puts it back.", null, h`<a class="btn btn-ghost" href="#/jobs">Job applications</a>`)}
${noticeBar("changes")}
${rows.length ? grid({ columns: ["When", "What changed", "Application", "Why", "By", h`<span class="sr-only">Undo</span>`], label: "Changes", wrap: true, rows }) : emptyState("No changes yet.")}`);
  });

  // ---- Actions ---------------------------------------------------------------------------------

  P.action("toggleMenu", ({ state }) => {
    state.ui.menuOpen = !state.ui.menuOpen;
  });
  P.action("open", ({ arg }) => P.go(arg));
  P.action("keepMenu", () => false); // Enter in a search box: the list already follows the typing

  // Applications table
  P.action("setTab", ({ state, arg }) => {
    state.table.tab = arg;
    state.ui.menu = null;
  });
  P.action("colMenu", ({ state, arg, event }) => {
    state.ui.menu = state.ui.menu === arg ? null : arg;
    state.ui.menuFocus = !!state.ui.menu && event && event.detail === 0;
  });
  P.action("closeMenu", ({ state }) => {
    state.ui.focusHeader = state.ui.menu;
    state.ui.menu = null;
  });
  P.action("sortBy", ({ state, arg }) => {
    const [key, dir] = arg.split(":");
    state.table.sort = key;
    state.table.dir = dir;
    state.ui.focusHeader = key;
    state.ui.menu = null;
  });
  P.action("togglePick", ({ state, arg }) => {
    const [key, value] = split2(arg);
    const list = state.table.picks[key] || [];
    state.table.picks[key] = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
    if (!state.table.picks[key].length) delete state.table.picks[key];
  });
  P.action("setText", ({ state, arg, value }) => {
    if (value) state.table.text[arg] = value;
    else delete state.table.text[arg];
  });
  P.action("search", ({ state, value }) => {
    state.table.q = value;
  });
  P.action("removeChip", ({ state, arg }) => {
    if (arg === "q") state.table.q = "";
    delete state.table.text[arg];
    delete state.table.picks[arg];
  });
  P.action("clearFilters", ({ state }) => {
    state.table.q = "";
    state.table.text = {};
    state.table.picks = {};
  });

  // Company page
  P.action("setStage", ({ arg }) => {
    const [id, stage] = split2(arg);
    setStage(app(id), stage);
  });
  P.action("pickReason", ({ state, value }) => {
    state.ui.lostReason = value;
  });
  P.action("markLost", ({ arg, form, state }) => {
    setStage(app(arg), "Lost", { reason: (form && form.get("reason")) || state.ui.lostReason || "rejected" });
  });
  P.action("reopen", ({ arg }) => {
    const a = app(arg);
    setStage(a, a.reopenTo || "Applied");
  });
  P.action("saveClose", ({ arg, form, state }) => {
    const a = app(arg);
    const raw = String(form.get("close_pct") || "").trim().replace(/%$/, "");
    const n = Number(raw);
    if (!raw || !Number.isInteger(n) || n < 0 || n > 100) {
      state.ui.err.close = "Type a whole number from 0 to 100.";
      return;
    }
    state.ui.err.close = null;
    if (n === a.close) return;
    makeChange({
      appId: a.id, what: `Close: ${a.close}% to ${n}%`, why: "You typed it on the company page",
      ops: [fieldOp(a, "close", n)], notice: { where: `company/${a.id}`, text: `Close set to ${n}%.` },
    });
  });
  P.action("editNext", ({ state, arg }) => {
    state.ui.nextOpen = arg;
    state.ui.err.next = null;
    state.ui.focusNext = true;
  });
  P.action("cancelNext", ({ state }) => {
    state.ui.nextOpen = null;
    state.ui.err.next = null;
  });
  P.action("saveNext", ({ state, arg, form }) => {
    const a = app(arg);
    const next = String(form.get("next") || "").trim();
    const due = String(form.get("due") || "");
    if (!next) {
      state.ui.err.next = "Write the next step.";
      return;
    }
    state.ui.nextOpen = null;
    state.ui.err.next = null;
    if (next === a.next && due === a.due) return;
    const words = (t, d) => (t || "none") + (d ? `, ${short(d)}` : "");
    makeChange({
      appId: a.id, what: `Next step: ${words(next, due)}`, details: [`Was: ${words(a.next, a.due)}`],
      why: "You changed it on the company page", ops: [fieldOp(a, "next", next), fieldOp(a, "due", due)],
      notice: { where: `company/${a.id}`, text: "Next step saved." },
    });
  });
  P.action("undo", ({ arg }) => {
    undoChange(arg);
  });
  // Changed by email: Undo, Looks right, Wrong application
  P.action("undoNote", ({ arg }) => {
    const [id, where] = split2(arg);
    undoChange(id, where);
  });
  P.action("noteOk", ({ state, arg }) => {
    state.changes.find((c) => c.id === arg).ok = true;
  });
  P.action("pickMove", ({ state, value }) => {
    state.ui.moveTo = value;
  });
  P.action("moveNote", ({ state, arg, form }) => {
    const c = state.changes.find((x) => x.id === arg);
    const to = String(form.get("to"));
    undoChange(c.id);
    const t = app(to);
    linkEmail(to, c.mail, { text: `Moved the email here, to ${t.company}, ${t.role}.` });
    state.ui.keepNotice = true;
    P.go(`#/company/${to}`);
  });

  // Emails, opened in place
  P.action("toggleMail", ({ state, arg }) => {
    const [list, id] = split2(arg);
    const now = openIn(list, P.route().query.open);
    state.ui.openMail[list] = now === id ? null : id;
    if (state.ui.pick === id) state.ui.pick = null;
    if (state.ui.linkAsk && state.ui.linkAsk.mail === id) state.ui.linkAsk = null;
  });
  P.action("unlink", ({ arg }) => {
    const [id, where] = split2(arg);
    unlinkEmail(id, where);
  });
  P.action("pickAttach", ({ state, arg, value }) => {
    state.ui.attachTo[arg] = value;
  });
  /** Attach an email: at once (A, C), or "Link it?" first (B). */
  function attachOrAsk(mailId, appId, where, after) {
    const ui = S().ui;
    if (mode() === "B") {
      ui.linkAsk = { mail: mailId, app: appId };
      return;
    }
    linkEmail(appId, mailId, { where: after ? `company/${appId}` : where });
    if (after) {
      ui.keepNotice = true;
      P.go(`#/company/${appId}`);
    }
  }
  P.action("attachMail", ({ arg, form }) => {
    const [id, where] = split2(arg);
    attachOrAsk(id, String(form.get("app")), where, false);
  });
  P.action("cancelAsk", ({ state }) => {
    state.ui.linkAsk = null;
  });
  P.action("linkAsked", ({ state, arg }) => {
    const [mailId, appId, where] = arg.split("|");
    state.ui.linkAsk = null;
    const fromSearch = where.endsWith("/add-email");
    linkEmail(appId, mailId, { where: fromSearch ? `company/${appId}` : where });
    if (fromSearch) {
      state.ui.keepNotice = true;
      P.go(`#/company/${appId}`);
    }
  });

  // Add missing email
  P.action("mailSearch", ({ state, arg, value }) => {
    state.ui.mailQ[arg] = value;
  });
  P.action("attach", ({ state, arg }) => {
    const [id, mailId] = split2(arg);
    state.ui.openMail.search = mailId;
    attachOrAsk(mailId, id, `company/${id}/add-email`, true);
  });

  // To confirm
  P.action("confirm", ({ arg }) => {
    linkAsRead(mailById(arg), { where: "confirm" });
  });
  P.action("notThis", ({ state, arg }) => {
    state.ui.pick = state.ui.pick === arg ? null : arg;
    state.ui.err.pick = null;
    state.ui.focusPick = !!state.ui.pick;
  });
  P.action("cancelPick", ({ state }) => {
    state.ui.pick = null;
  });
  P.action("pickTo", ({ state, arg, value }) => {
    state.ui.pickTo[arg] = value;
  });
  P.action("pickLink", ({ state, arg, form }) => {
    const m = mailById(arg);
    const to = String(form.get("to"));
    if (to === "new") {
      const company = String(form.get("company") || "").trim();
      if (!company) {
        state.ui.err.pick = "Write the company name.";
        return;
      }
      createFromEmail(m, { company, role: String(form.get("role") || "").trim(), where: "confirm" });
    } else {
      linkEmail(to, m.id, { where: "confirm" });
    }
    state.ui.pick = null;
  });
  P.action("notRelevant", ({ state, arg }) => {
    const m = mailById(arg);
    state.ui.pick = null;
    makeChange({
      appId: null, mail: m.id, what: `Not relevant: "${m.subject}"`, why: "You marked it in To confirm",
      ops: [mailOp(m, "waiting", false), mailOp(m, "ignored", true)],
      notice: { where: "confirm", text: `Marked "${m.subject}" as not relevant.` },
    });
  });

  // ---- New mail, then scenarios ------------------------------------------------------------------

  readNewMail();

  /** The calendar invite attached from Search your mail (Add a missing email). */
  P.scenario("linked", (state) => {
    linkEmail("northwind", "m-invite", { where: "company/northwind" });
    state.ui.keepNotice = true;
  });
  /** Option B: Maya's email confirmed from To confirm. */
  P.scenario("confirmed", (state) => {
    if (mailById("m-maya").waiting) linkAsRead(mailById("m-maya"), { where: "company/northwind", text: "Linked 1 email you confirmed. Stage moved to Hiring manager." });
    state.ui.keepNotice = true;
  });
  /** Option C: the Topgig match confirmed (a new lead). */
  P.scenario("confirmed-c", (state) => {
    if (mailById("m-topgig").waiting) linkAsRead(mailById("m-topgig"), { where: "confirm" });
    state.ui.keepNotice = true;
  });
  /** Applications filtered to Remote, sorted by pay, highest first. */
  P.scenario("filtered", (state) => {
    state.table.picks = { where: ["Remote"] };
    state.table.sort = "pay";
    state.table.dir = "desc";
  });

  // ---- After each draw: the column menu under its header, and focus ---------------------------

  const PHONE = "(max-width: 760px)";
  function headerFor(key) {
    const all = [...document.querySelectorAll(`[data-colmenu="${key}"]`)];
    return all.find((b) => b.offsetParent !== null) || all[0] || null;
  }
  /** static/table-filters.js place(): under the header, above it when there is more room there. */
  function place(box, anchor) {
    if (!box) return;
    if (window.matchMedia(PHONE).matches) {
      box.style.left = box.style.top = box.style.maxHeight = "";
      return;
    }
    if (!anchor || !anchor.isConnected) return;
    const at = anchor.getBoundingClientRect();
    const room = window.innerHeight;
    const left = Math.min(at.left, window.innerWidth - box.offsetWidth - 8);
    box.style.left = Math.max(8, left) + "px";
    box.style.maxHeight = "";
    const below = room - at.bottom - 12;
    const above = at.top - 12;
    const height = Math.min(box.offsetHeight, 440);
    let top;
    if (height <= below || below >= above) {
      top = at.bottom + 4;
      box.style.maxHeight = Math.max(160, Math.min(440, below)) + "px";
    } else {
      box.style.maxHeight = Math.max(160, Math.min(440, above)) + "px";
      top = Math.max(8, at.top - 4 - Math.min(box.offsetHeight, above));
    }
    box.style.top = Math.max(8, Math.min(top, room - 8 - Math.min(box.offsetHeight, room - 16))) + "px";
  }
  const follow = () => {
    const key = S().ui.menu;
    if (key) place(document.querySelector(`[data-colmenu-for="${key}"]`), headerFor(key));
  };

  P.afterRender = () => {
    const ui = S().ui;
    follow();
    if (ui.menu && ui.menuFocus) {
      ui.menuFocus = false;
      const box = document.querySelector(`[data-colmenu-for="${ui.menu}"]`);
      const first = box && (box.querySelector('input[type="search"]') || box.querySelector(".col-menu-item"));
      if (first) first.focus();
    }
    if (ui.focusHeader) {
      const back = headerFor(ui.focusHeader);
      ui.focusHeader = null;
      if (back) back.focus();
    }
    if (ui.focusNext) {
      ui.focusNext = false;
      const input = document.getElementById("next-step");
      if (input) input.focus();
    }
    if (ui.focusPick) {
      ui.focusPick = false;
      const select = document.querySelector(".proto-pick-panel select");
      if (select) select.focus();
    }
  };

  // A click outside the open column menu closes it. Capture phase: it runs before the kit, so an
  // action the click starts draws the page with the menu already closed.
  document.addEventListener("click", (e) => {
    const ui = S().ui;
    if (!ui.menu || e.target.closest("[data-colmenu-for], [data-colmenu]")) return;
    ui.menu = null;
    document.querySelectorAll("[data-colmenu-for]").forEach((m) => m.remove());
    document.querySelectorAll('[data-colmenu][aria-expanded="true"]').forEach((b) => b.setAttribute("aria-expanded", "false"));
  }, true);
  document.addEventListener("keydown", (e) => {
    const ui = S().ui;
    if (e.key === "Escape") {
      if (ui.menu) {
        ui.focusHeader = ui.menu;
        ui.menu = null;
        P.render();
      } else if (ui.menuOpen) {
        ui.menuOpen = false;
        P.render();
      }
      return;
    }
    // A pick is a link with the checkbox role: Space works it too.
    if (e.key === " " && e.target.matches && e.target.matches('.col-menu-item[role="checkbox"]')) {
      e.preventDefault();
      e.target.click();
    }
  });
  window.addEventListener("resize", follow);
  document.addEventListener("scroll", follow, { capture: true, passive: true });
})();
