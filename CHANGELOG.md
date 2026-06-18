# Changelog

All notable changes to **plan-html** are documented here.

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
