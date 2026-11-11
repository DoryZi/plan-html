# Changelog

All notable changes to **plan-html** are documented here.

## v0.2.1 — 2026-11-11

### A calmer bottom bar
- One short hint line above the bar instead of a status that wrapped.
- A progress chip ("5 of 11 · 6 left") that is also the filter: click it to see
  only what is left, click again for everything.
- "Expand all" is a quiet button next to the chip. "Send to agent" is an
  outline and "Finalize plan" is the one solid button.
- The theme switch moved to the top right of the page and follows the system's
  day or night setting until you click it.
- A short demo video in the README.

## v0.2.0 — 2026-11-11

### Design in the deck
- **Mock screens as options.** A design question shows each option as a strip of
  mock screens. Any screen opens full size in a viewer you can step through,
  with notes pinned to its elements. `templates/proto-kit.js` is the small
  script a screen loads to take part.
- **Clickable prototypes** with walk-throughs per intent, and
  `check_prototype.py` to click through every screen in a headless browser and
  report dead controls.
- Worked examples in `examples/mocks` and `examples/prototype`.

### A calmer deck
- Sections fold from their headings and remember it. Reference sections start
  folded.
- A menu of the deck: a rail on wide screens, a sheet from the dock on a phone.
  It lists the sections with their counts; a section's cards show on demand.
- Cards open with only the statement and the decision. "Ask the agent",
  "Write your own" and "Edit" open from small buttons.
- The summary, "How it works" and the interview open from one row of buttons
  under the goal.
- Answered cards fold away and "Show what's left" is always in the dock.
- A look pass: one button system, clearer card states, focus rings, 44px
  controls on a phone, reduced motion respected.

### Plans on disk
- `cycles.py`: plans live in dated cycle folders
  (`cycles/YYYY-MM-DD-NN-<slug>/`).
- `finalize_plan.py`: Finalize writes a `plan.md` builders can execute, next to
  the `plan.json`.
- Card images from the plan's `files/` folder, `plan.bulk` buttons (for example
  "Fix all") and `hideEmpty` sections.

### Fixes
- Browser Back closes the prototype viewer and stepping through screens adds no
  history entries.
- Quotes in image alt text and link URLs can no longer break out of their
  attributes.

## v0.1.3

- The interview is a real popup, and a "Discovered" section shows what the
  agent found.

## v0.1.2

- The interview popup rebuilds the deck from your discovery answers.
- Syncing from the source keeps the portable serve command.

## v0.1.1 — 2026-06-19

- Add Claude Code **plugin-marketplace support** (`.claude-plugin/plugin.json` +
  `marketplace.json`) so plan-html can be installed via
  `/plugin marketplace add DoryZi/plan-html`.
- Add install instructions (plugin marketplace + clone) to the README.
- Refresh the plugin description (benefit-first) and point the homepage at the
  write-up.

## v0.1.0 — 2026-06-18

First public release.

### Features
- **Interactive decision deck** — render a `plan.json` as a live HTML deck:
  intent / decision / boundary cards, hi-fi mocks, implementation steps, and a
  final-verify "finish line."
- **Reshapeable** — add, edit, strike, and drag-reorder cards, steps, and
  finish-line rows; changes ride back to the agent.
- **Live mode (`--live`)** — ask a card a question and the agent's reply streams
  back over SSE; answers are written into the plan so they survive reconnects.
- **Adaptive polling fallback** — keeps the deck in sync over proxies that
  buffer SSE (e.g. Cloudflare quick-tunnels).
- **Finalize on your terms** — finalize early and hand unanswered cards to the
  agent (with a confirm), or loop until everything's pinned.
- **Autosave** — every answer persists next to the plan; nothing is lost on an
  interrupted session.
- **Zero runtime dependencies** — stdlib Python server, single offline
  `deck.html`. No build step, no CDN.

### Tested
- pytest (unit + HTTP e2e) and Playwright browser e2e; ESLint over the deck's
  inline JS. CI runs lint + the Python suite on every push.
