// Entry point for the plan deck. Bundled by scripts/build.js into the single
// inline <script> of templates/deck.html.
//
// PLAN/SAVED injection: serve_plan.py renders the deck by substituting two
// anchor lines that are PREPENDED, verbatim, before this bundle inside the
// <script> tag:
//
//     let PLAN = {{PLAN_JSON}};
//     const SAVED = {{SAVED_ANSWERS}};
//
// Those lines assign to globals (top-level `let`/`const` in the IIFE's
// enclosing function scope are NOT visible here, so build.js emits them as
// `window.PLAN`/`window.SAVED` — see build.js). This module reads window.PLAN /
// window.SAVED. The anchor lines stay exactly as-is so serve_plan.py's anchored
// substitution keeps working.

import { el, mdEl, createLightbox } from "./dom.js";
import { md, escapeHtml } from "./md.js";
import { createStore, restore, createPersist } from "./state.js";
import { createSections } from "./sections.js";
import { createLive } from "./live.js";

const PLAN = window.PLAN;
const SAVED = window.SAVED;

// ---------- theme: follow the OS by default, remember the user's pick ----------
const THEME_KEY = "plan-html-theme";
const applyTheme = (t) => {
  document.documentElement.dataset.theme = t;
  const btn = document.getElementById("themeBtn");
  if (btn) { btn.textContent = t === "light" ? "🌙" : "☀️"; }
};
let savedTheme = null;
try { savedTheme = localStorage.getItem(THEME_KEY); }
catch (e) { console.warn("theme restore failed", e); }
// default by time of day: light 07:00-19:00, dark at night; your pick wins once made
const hour = new Date().getHours();
applyTheme(savedTheme || (hour >= 7 && hour < 19 ? "light" : "dark"));
document.getElementById("themeBtn").addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  applyTheme(next);
  try { localStorage.setItem(THEME_KEY, next); }
  catch (e) { console.warn("theme save failed", e); }
});

// ---------- build the shared app context ----------
const store = createStore(PLAN, SAVED);
restore(store);

const { openLightbox, zoomableDiagram } = createLightbox();

// `app` is the shared context every module reads from. Methods that depend on
// later-created modules (refreshAddBtns from sections, refreshAll/refreshBar
// from live, renderSections from sections) are attached as those modules build.
const app = {
  store, el, mdEl, md, escapeHtml, openLightbox, zoomableDiagram,
};

// autosave: localStorage immediately + POST /save debounced. onPersist flips the
// +/- add buttons live as a trailing blank draft gains content.
const { persist } = createPersist(store, () => {
  if (app.refreshAddBtns) app.refreshAddBtns();
});
app.persist = persist;

// touched(): persist + refresh every card and the bar. Defined here so cards and
// the agent-actions panel can call app.touched() through the context.
app.touched = () => { persist(); if (app.refreshAll) app.refreshAll(); };

// wire sections (provides renderSections + refreshAddBtns) and live (provides
// refreshAll/refreshBar + startLive). Order: live first so refreshAll exists
// before the first renderSections call, but sections must publish renderSections
// before live's reconcile uses it — both only run on the explicit calls below.
const live = createLive(app);
const sections = createSections(app);

// initial render + go live
sections.renderSections();
live.startLive();
