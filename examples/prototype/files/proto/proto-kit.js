/* proto-kit: the small runtime every plan-html prototype runs on. Copy it next to the prototype's
   index.html and load it after the data (window.PROTO_DATA) and before the screens.

   A prototype is one page with hash routes (#/jobs, #/company/northwind?scenario=linked). The kit
   keeps one in-memory state (a copy of PROTO_DATA, fresh on every load), draws the screen for the
   current route into #app, and wires every click:
     - <a href="#/...">            goes to that route
     - data-action="name"          runs Proto.action("name", fn), then redraws (fn returns false: no redraw)
     - <form data-action="name">   same, with the form's fields in ctx.form (a FormData)
     - data-change / data-input    an action on a select, checkbox or text field (input keeps focus)
     - anything else clickable     says it is outside this design (marked data-proto-stub, so the
                                   checker counts it as a stub, not a dead click). Give it
                                   data-out="app" when it works in the real app today ("works in the
                                   app, not part of this design"), or data-out="<your words>".
   Scope: everything inside the feature being designed works for real (open the email, the person,
   the timeline item); everything outside it may stay visible but must say so when clicked; nothing
   may look clickable and do nothing. A click on an empty spot briefly marks every clickable thing:
   blue = works in this design, grey dashed = outside it (the deck can also turn the marks on).
   Variants: index.html?v=attach:B&v=table:A picks option B of fork "attach"; Proto.variant("attach").
   Scenarios: a route's ?scenario=name runs Proto.scenario("name", fn) once on load, so a journey step
   can open straight into a later state (after the email was attached, for example). Scenarios and
   variants are read when the page loads: the deck reloads the page to change them.
   Each redraw keeps: focus and the caret in a field with an id, and every <details id=...> left open.
   A new route scrolls to the top. Proto.beforeRender(route) runs before each draw, Proto.afterRender()
   after it. An action that calls Proto.go("#/...") needs no return value: the new route draws once.
   Mocks: a static page (no Proto.screen registered) that loads this kit keeps its markup, swallows every click
   (the next screen of the strip shows the result), and still takes the deck's pinned notes. In the deck's
   walk-through the step's `click` is ringed, and a click on it tells the deck to open the next screen.
   Proto.findTarget(spec) finds that control (a CSS selector, or its words); check_prototype.py uses it. */
(function () {
  "use strict";
  const params = new URLSearchParams(location.search);
  const variants = {};
  params.getAll("v").forEach((pair) => {
    const at = pair.indexOf(":");
    if (at > 0) variants[pair.slice(0, at)] = pair.slice(at + 1);
  });
  const screens = [];
  const actions = {};
  const scenarios = {};
  let scenarioDone = false;
  let lastPath = null;

  class Safe {
    constructor(s) {
      this.s = s;
    }
    toString() {
      return this.s;
    }
  }
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const fmt = (v) => (v instanceof Safe ? v.s : Array.isArray(v) ? v.map(fmt).join("")
    : v == null || v === false ? "" : esc(v));

  const P = {
    /** The prototype's state: a fresh copy of window.PROTO_DATA on every page load. */
    state: JSON.parse(JSON.stringify(window.PROTO_DATA || {})),
    /** html`<td>${name}</td>`: values are escaped; nested html`` results and arrays of them are not. */
    html: (strings, ...vals) => new Safe(strings.reduce((out, s, i) => out + s + (i < vals.length ? fmt(vals[i]) : ""), "")),
    /** Trusted markup you built yourself, inserted as is. */
    raw: (s) => new Safe(String(s)),
    esc,
    /** The option picked for a fork (index.html?v=fork:KEY), else the fallback (default "A"). */
    variant: (fork, fallback) => variants[fork] || fallback || "A",
    /** Register a screen: pattern "company/:id" (no leading #/), render(params, query) returns html``. */
    screen(pattern, render) {
      const keys = [];
      const re = new RegExp("^" + pattern.replace(/:([A-Za-z_]+)/g, (_, k) => {
        keys.push(k);
        return "([^/]+)";
      }) + "$");
      screens.push({ re, keys, render });
    },
    /** Register an action: fn(ctx) with ctx = {el, arg, event, form, state, value}. */
    action(name, fn) {
      actions[name] = fn;
    },
    /** Register a scenario: fn(state, query) prepares the state for a route opened with ?scenario=name. */
    scenario(name, fn) {
      scenarios[name] = fn;
    },
    /** The current route: {path: "company/northwind", query: {scenario: "linked"}}. */
    route() {
      const raw = location.hash.replace(/^#\/?/, "");
      const at = raw.indexOf("?");
      const path = decodeURIComponent(at < 0 ? raw : raw.slice(0, at));
      const query = Object.fromEntries(new URLSearchParams(at < 0 ? "" : raw.slice(at + 1)));
      return { path, query };
    },
    /** Go to a route ("#/jobs"); the same route again just redraws. */
    go(hash) {
      if (location.hash === hash) P.render();
      else if (window.parent !== window) location.replace(hash);  // in the deck: no history entry per screen
      else location.hash = hash;
    },
    /** Draw the current route into #app, keeping focus and the caret in a field that has an id. */
    render() {
      const app = document.getElementById("app");
      if (!app || !screens.length) return;  // a static mock (no screens registered): its markup stays as written
      const { path, query } = P.route();
      if (!scenarioDone) {
        scenarioDone = true;
        if (query.scenario && scenarios[query.scenario]) scenarios[query.scenario](P.state, query);
      }
      if (P.beforeRender) P.beforeRender({ path, query });
      const active = document.activeElement;
      const focusId = active && active.id && app.contains(active) ? active.id : null;
      const openIds = [...app.querySelectorAll("details[open][id]")].map((d) => d.id);
      const caret = focusId && "selectionStart" in active ? [active.selectionStart, active.selectionEnd] : null;
      let out = null;
      for (const s of screens) {
        const m = s.re.exec(path);
        if (m) {
          const params = {};
          s.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
          out = s.render(params, query);
          break;
        }
      }
      if (out == null) {
        const home = screens[0];
        out = P.html`<main class="main"><h1>Not in this prototype</h1><p>No screen for #/${path}.</p>
          ${home ? P.html`<p><a href="#/">Back to the start</a></p>` : ""}</main>`;
      }
      app.innerHTML = fmt(out);
      openIds.forEach((id) => {
        const d = document.getElementById(id);
        if (d && d.tagName === "DETAILS") d.open = true;
      });
      if (path !== lastPath) {
        if (lastPath !== null) window.scrollTo(0, 0);
        lastPath = path;
      }
      if (focusId) {
        const again = document.getElementById(focusId);
        if (again) {
          again.focus();
          if (caret && "setSelectionRange" in again) {
            try {
              again.setSelectionRange(caret[0], caret[1]);
            } catch (e) {
              /* not a text field */
            }
          }
        }
      }
      if (P.afterRender) P.afterRender();
      drawNotes();
      if (guide) setTimeout(() => placeGuide(true), 30);
    },
    /** A short message at the bottom of the screen. */
    toast(text, stub) {
      let t = document.getElementById("proto-toast");
      if (!t) {
        t = document.createElement("div");
        t.id = "proto-toast";
        t.setAttribute("role", "status");
        t.style.cssText = "position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:9999;" +
          "max-width:calc(100vw - 32px);padding:10px 16px;border-radius:8px;background:#141414;color:#fff;" +
          "font:14px/1.4 system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.25)";
        document.body.appendChild(t);
      }
      t.textContent = text;
      if (stub) t.setAttribute("data-proto-stub", "");
      else t.removeAttribute("data-proto-stub");
      t.hidden = false;
      clearTimeout(t._timer);
      t._timer = setTimeout(() => (t.hidden = true), 2400);
    },
  };

  const stub = (el) => {
    const what = (el.getAttribute("aria-label") || el.textContent || "This").trim().replace(/\s+/g, " ").slice(0, 40);
    const out = (el.closest("[data-out]") || el).getAttribute("data-out");
    const why = out === "app" ? "works in the app, not part of this design" : out || "not part of this design";
    P.toast(`${what}: ${why}`, true);
  };

  // hotspot marks: a click on an empty spot shows what is clickable for a moment; the deck can keep them on
  const REAL = 'a[href^="#/"]:not([data-out]), [data-action]:not(form), [data-change], [data-input], summary, form[data-action] [type=submit]';
  const ANY = 'a[href], button, [role=button], select, input[type=checkbox], input[type=radio], summary, [data-action]:not(form)';
  const hintStyle = document.createElement("style");
  hintStyle.textContent =
    `.proto-hints :is(${REAL}){outline:2px solid rgba(37,99,235,.85)!important;outline-offset:1px;border-radius:4px}` +
    `.proto-hints :is(${ANY}):not(:is(${REAL})){outline:2px dashed rgba(120,113,108,.9)!important;outline-offset:1px;border-radius:4px}`;
  document.head.appendChild(hintStyle);
  let hintTimer = null;
  const flashHints = () => {
    document.body.classList.add("proto-hints");
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => {
      if (!P.hintsOn) document.body.classList.remove("proto-hints");
    }, 1400);
  };
  P.hintsOn = false;
  window.addEventListener("message", (e) => {
    if (e.data && typeof e.data.planHtmlHints === "boolean") {
      P.hintsOn = e.data.planHtmlHints;
      document.body.classList.toggle("proto-hints", P.hintsOn);
    }
  });
  const run = (name, el, event, form) => {
    const fn = actions[name];
    if (!fn) {
      console.warn(`proto-kit: no action named "${name}"`);
      stub(el);
      return;
    }
    const value = el.type === "checkbox" ? el.checked : "value" in el ? el.value : undefined;
    const hashBefore = location.hash;
    const redraw = fn({ el, arg: el.dataset.arg, event, form, state: P.state, value });
    // an action that went to another route is drawn by the hashchange; draw here only when it stayed
    if (redraw !== false && location.hash === hashBefore) P.render();
  };

  document.addEventListener("click", (e) => {
    if (!screens.length) {  // a static mock: only the step's ringed control does something: the deck opens the next screen
      if (e.target.closest("a, button, [role=button], summary, label, input, select")) e.preventDefault();
      const t = guide && guide.next ? guideTarget() : null;
      if (t && t.contains(e.target)) tell({ planHtmlNext: 1 });
      return;
    }
    const t = e.target.closest("[data-action], a, button, [role=button], summary, label");
    if (!t && !e.target.closest("input, textarea, select, [contenteditable], [data-proto-native]")) {
      flashHints();
      return;
    }
    if (!t || t.closest("[data-proto-native]")) return;
    if (t.tagName === "FORM") return;
    if (t.dataset.action && t.tagName !== "FORM") {
      e.preventDefault();
      run(t.dataset.action, t, e);
      return;
    }
    if (t.tagName === "LABEL" || t.tagName === "SUMMARY") return;
    if (t.tagName === "A") {
      const href = t.getAttribute("href") || "";
      if (href.startsWith("#/")) {
        e.preventDefault();
        P.go(href);
        return;
      }
      e.preventDefault();
      if (href && href !== "#") P.toast("This link leaves the prototype", true);
      else stub(t);
      return;
    }
    if (t.type === "submit" && t.form) return;
    e.preventDefault();
    stub(t);
  });
  document.addEventListener("submit", (e) => {
    const f = e.target;
    e.preventDefault();
    if (!screens.length) return;
    if (f.dataset.action) run(f.dataset.action, f, e, new FormData(f));
    else stub(f);
  });
  document.addEventListener("change", (e) => {
    const t = e.target.closest("[data-change]");
    if (t) run(t.dataset.change, t, e);
  });
  document.addEventListener("input", (e) => {
    const t = e.target.closest("[data-input]");
    if (t) run(t.dataset.input, t, e);
  });
  // notes from the deck, pinned to the element they are about: Comment mode highlights the element under the
  // pointer and a click reports it (its selector and words) to the deck; the deck sends back the notes of this
  // screen and the kit draws them on their elements, so a pin moves with what it points at.
  let commenting = false;
  let notesHere = [];
  let scale = 1; // the deck shows this screen scaled down: pins keep their size on the deck's screen
  const layer = document.createElement("div");
  layer.style.cssText = "position:absolute;left:0;top:0;width:0;height:0;z-index:9998";
  const hover = document.createElement("div");
  hover.style.cssText = "position:fixed;z-index:9997;pointer-events:none;border:2px solid #f59e0b;border-radius:4px;" +
    "background:rgba(245,158,11,.10);display:none";
  const tell = (msg) => {
    try {
      parent.postMessage(msg, "*");
    } catch (e) {
      /* not inside the deck */
    }
  };
  const selectorOf = (el) => {
    const parts = [];
    for (let e = el; e && e.nodeType === 1 && e !== document.body; e = e.parentElement) {
      if (e.id) {
        parts.unshift("#" + CSS.escape(e.id));
        break;
      }
      let i = 1;
      for (let s = e.previousElementSibling; s; s = s.previousElementSibling) if (s.tagName === e.tagName) i++;
      parts.unshift(`${e.tagName.toLowerCase()}:nth-of-type(${i})`);
    }
    return parts.join(" > ");
  };
  const words = (el) => (el.getAttribute("aria-label") || (el.labels && el.labels[0] ? el.labels[0].textContent : "")
    || el.getAttribute("placeholder") || el.textContent || el.value || el.name || "").trim().replace(/\s+/g, " ").slice(0, 60);
  const describe = (el) => {
    const what = { a: "link", button: "button", input: "field", select: "menu", textarea: "text box", th: "column header",
      td: "cell", tr: "row", h1: "title", h2: "heading", h3: "heading", img: "image" }[el.tagName.toLowerCase()] || el.tagName.toLowerCase();
    const row = el.closest("tr, li");
    const inRow = row && row !== el ? ` (in the row "${words(row).slice(0, 50)}")` : "";
    return `${what} "${words(el) || "(no words)"}"${inRow}`;
  };
  // a pin goes on the most meaningful thing under the pointer: a control, a row or cell, else what was hit
  const targetAt = (el) => (el && el.closest("a, button, input, select, textarea, label, th, td, li, h1, h2, h3, img, [data-action]")) || el;
  const drawNotes = () => {
    if (!layer.isConnected) document.body.appendChild(layer);
    layer.replaceChildren();
    notesHere.forEach((n) => {
      let x, y;
      const el = n.selector ? document.querySelector(n.selector) : null;
      if (el && el.getClientRects().length) {
        const r = el.getBoundingClientRect();
        x = r.left + scrollX + (n.ex == null ? 0.5 : n.ex) * r.width;
        y = r.top + scrollY + (n.ey == null ? 0.5 : n.ey) * r.height;
      } else if (n.x != null) {
        x = n.x * innerWidth + scrollX;
        y = n.y * innerHeight + scrollY;
      } else return;
      const size = Math.min(140, 24 / scale), half = size / 2;
      const pin = document.createElement("button");
      pin.type = "button";
      pin.textContent = n.pending ? "" : String(n.num);
      pin.setAttribute("aria-label", n.pending ? "New note" : `Note ${n.num}: ${n.text || ""}`);
      pin.dataset.protoNative = "";
      pin.style.cssText = `position:absolute;left:${x - half}px;top:${y - half}px;width:${size}px;height:${size}px;border-radius:50%;` +
        `font:800 ${size / 2}px/${size - 4}px system-ui,sans-serif;text-align:center;padding:0;cursor:pointer;` +
        `box-shadow:0 2px 6px rgba(0,0,0,.35);border-width:${Math.max(2, 2 / scale)}px!important;` +
        (n.pending ? "background:transparent;border:2px dashed #f59e0b;color:#f59e0b" : "background:#f59e0b;border:2px solid #fff;color:#111");
      pin.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!n.pending) tell({ planHtmlOpenNote: n.id, px: (x - scrollX) / innerWidth, py: (y - scrollY) / innerHeight });
      });
      layer.appendChild(pin);
    });
  };
  window.addEventListener("message", (e) => {
    const d = e.data || {};
    if (typeof d.planHtmlComment === "boolean") {
      commenting = d.planHtmlComment;
      document.documentElement.style.cursor = commenting ? "crosshair" : "";
      if (!commenting) hover.style.display = "none";
    }
    if (typeof d.planHtmlFocus === "string") {
      const el = document.querySelector(d.planHtmlFocus);
      if (el) {
        el.scrollIntoView({ block: "start" });
        window.scrollBy(0, -12);
      }
    }
    if (typeof d.planHtmlScale === "number" && d.planHtmlScale > 0) scale = d.planHtmlScale;
    if (Array.isArray(d.planHtmlNotes)) {
      notesHere = d.planHtmlNotes;
      drawNotes();
    }
  });
  document.addEventListener("mousemove", (e) => {
    if (!commenting) return;
    const t = targetAt(e.target);
    if (!t || t === document.body || t === document.documentElement || layer.contains(t)) {
      hover.style.display = "none";
      return;
    }
    if (!hover.isConnected) document.body.appendChild(hover);
    const r = t.getBoundingClientRect();
    Object.assign(hover.style, { display: "block", left: r.left - 2 + "px", top: r.top - 2 + "px", width: r.width + 4 + "px",
      height: r.height + 4 + "px" });
  }, true);
  window.addEventListener("click", (e) => {
    if (!commenting || layer.contains(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    const t = targetAt(e.target);
    const r = t.getBoundingClientRect();
    tell({ planHtmlNewNote: {
      selector: selectorOf(t), element: describe(t), route: location.hash,
      ex: r.width ? +((e.clientX - r.left) / r.width).toFixed(3) : 0.5, ey: r.height ? +((e.clientY - r.top) / r.height).toFixed(3) : 0.5,
      x: +(e.clientX / innerWidth).toFixed(4), y: +(e.clientY / innerHeight).toFixed(4) } });
  }, true);
  // in Comment mode nothing in the screen reacts (no field takes focus, no menu opens): the click is for the note
  ["mousedown", "pointerdown", "submit", "change", "input"].forEach((type) => window.addEventListener(type, (e) => {
    if (commenting && !layer.contains(e.target)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true));
  // Esc while commenting reaches the deck even when the click put the focus in here
  window.addEventListener("keydown", (e) => {
    if (commenting && e.key === "Escape") tell({ planHtmlEscape: 1 });
  }, true);
  window.addEventListener("resize", drawNotes);
  tell({ planHtmlKit: 1 });

  // the guide (the deck's walk-through): ring the thing to click on this step, dim the rest, and a bubble that says
  // what to do. The target is a CSS selector, or words: "click Pine Labs" finds the clickable thing named Pine Labs.
  let guide = null;
  const ring = document.createElement("div");
  ring.style.cssText = "position:fixed;z-index:9996;pointer-events:none;border:3px solid #2563eb;border-radius:8px;" +
    "box-shadow:0 0 0 9999px rgba(15,23,42,.35),0 0 0 6px rgba(37,99,235,.25);transition:all .15s;display:none";
  const bubble = document.createElement("div");
  bubble.setAttribute("role", "status");
  bubble.style.cssText = "position:fixed;z-index:9997;max-width:300px;padding:10px 12px;border-radius:10px;background:#1e3a8a;" +
    "color:#fff;font:600 14px/1.35 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.3);pointer-events:none;display:none";
  const CLICKABLE = "a, button, [role=button], summary, label, input, select, textarea, th, [data-action]";
  const visible = (e) => e.getClientRects().length && getComputedStyle(e).visibility !== "hidden";
  const findTarget = (spec) => {
    if (!spec) return null;
    if (/^[#.\[]/.test(spec)) {
      try {
        const e = document.querySelector(spec);
        if (e && visible(e)) return e;
      } catch (err) {
        /* not a selector: try the words */
      }
    }
    const want = spec.replace(/^(then\s+)?(click|press|open|pick|choose|select|tap|turn (on|off)|use|filter( by)?|go to)\s+/i, "")
      .replace(/^(the|on)\s+/i, "").replace(/["'.]/g, "").trim().toLowerCase();
    if (!want) return null;
    const text = (e) => (e.getAttribute("aria-label") || e.textContent || e.value || "").replace(/\s+/g, " ").trim().toLowerCase();
    const best = (all) => all.find((e) => text(e) === want) || all.find((e) => text(e).startsWith(want))
      || all.find((e) => text(e).includes(want)) || all.find((e) => want.includes(text(e)) && text(e).length > 3) || null;
    // controls first, column headers only when no control fits: a header that reads "Attach" (screen-reader text)
    // must not win over an Attach button named "Attach <the email>"
    const all = [...document.querySelectorAll(CLICKABLE)].filter(visible);
    return best(all.filter((e) => e.tagName !== "TH")) || best(all.filter((e) => e.tagName === "TH"));
  };
  P.findTarget = findTarget;
  const guideTarget = () => (guide ? findTarget(guide.target) || findTarget(guide.text) : null);
  // scroll = bring the target into view (only when a step's guide first arrives; a scroll by the user just follows)
  const placeGuide = (scroll) => {
    if (!guide) {
      ring.style.display = bubble.style.display = "none";
      return;
    }
    if (!ring.isConnected) document.body.append(ring, bubble);
    const t = guideTarget();
    const pointsSomewhere = Boolean(guide.target || guide.text);
    const goOn = t && guide.next && !screens.length ? (/[.?!]$/.test(guide.label) ? " " : ". ") + "Click it to go on." : "";
    bubble.textContent = guide.label + goOn + (t || !pointsSomewhere ? "" : " (scroll or look around: it is on this screen)");
    if (!t) {
      ring.style.display = "none";
      Object.assign(bubble.style, { display: "block", left: "16px", top: "16px" });
      return;
    }
    const r0 = t.getBoundingClientRect();
    if (scroll && (r0.top < 0 || r0.bottom > innerHeight)) t.scrollIntoView({ block: "center" });
    const r = t.getBoundingClientRect();
    Object.assign(ring.style, { display: "block", left: r.left - 5 + "px", top: r.top - 5 + "px", width: r.width + 10 + "px",
      height: r.height + 10 + "px" });
    const below = r.bottom + 12 + 60 < innerHeight;
    Object.assign(bubble.style, { display: "block", left: Math.max(8, Math.min(r.left, innerWidth - 316)) + "px",
      top: (below ? r.bottom + 12 : Math.max(8, r.top - 72)) + "px" });
  };
  window.addEventListener("message", (e) => {
    const d = e.data || {};
    if ("planHtmlGuide" in d) {
      const g = d.planHtmlGuide;
      guide = g && (g.target || g.text || g.label) ? g : null; // a label alone (the last step) shows the bubble, no ring
      setTimeout(() => placeGuide(true), 60);
    }
  });
  window.addEventListener("resize", () => guide && placeGuide(false));
  window.addEventListener("scroll", () => guide && placeGuide(false), true);
  window.addEventListener("hashchange", () => {
    guide = null; // the deck sends the next step's guide once it sees the new route
    placeGuide(false);
  });

  window.addEventListener("hashchange", () => P.render());
  window.Proto = P;
  // draw once the screens below the kit have registered
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => P.render());
  else setTimeout(() => P.render(), 0);
})();
