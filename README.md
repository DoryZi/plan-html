<!-- experiment-banner:start -->
> 🧪 **This is an experiment** — part of [**AI Will Replace You**](https://doryzidon.com).
>
> **Stop wasting time on AI. I run practical experiments — real lessons you can use tomorrow, biweekly.**
>
> **[Subscribe to AI Will Replace Your Engineers →](https://doryzidon.com)**
>
> ▶ Full walkthrough on YouTube — _coming soon_ · [@aiwillreplaceyou](https://youtube.com/@aiwillreplaceyou)
<!-- experiment-banner:end -->

# plan-html

**Interactive decision-deck planning.** Turn a `plan.json` into a live HTML deck
you work through in the browser — intent cards, decision cards, boundaries,
implementation steps and a final-verify "finish line" — answered with buttons
or your own words, iterated in rounds until you finalize. Every answer
autosaves, so an interrupted session loses nothing.

It pairs with an agent: the agent writes the `plan.json`, serves it, and answers
your questions live; you reshape the plan in the browser (add/edit/strike cards,
reorder, ask, grill). The deck is the review surface — not a wall of markdown in
a terminal.

## What's here

| Path | What it is |
|------|------------|
| `serve_plan.py` | The server. Renders `plan.json` into the deck, serves it on `127.0.0.1`, autosaves answers, streams plan changes over SSE (`--live`), and prints each round to stdout. Zero dependencies (stdlib only). |
| `templates/deck.html` | The deck — a single self-contained, offline HTML file. **Built artifact** (see below), not hand-edited. |
| `src/` | The deck's JavaScript, as ES modules. Edit here. |
| `scripts/build.js` | Bundles `src/*.js` into the one inline `<script>` in `templates/deck.html` (esbuild). |
| `tests/` | `tests/js` (node:test unit), `tests/e2e` (pytest HTTP + Playwright browser). |

## Quick start

```bash
# serve a plan (no Node needed to run — the deck is pre-built)
python3 serve_plan.py --plan /abs/path/to/plan.json --live
```

The deck opens in your browser. Work through the cards; answers autosave to
`answers.json` next to the plan. Click **Send to agent** to ship a round, or
**Finalize** when you're done.

### Phone / remote access

```bash
python3 serve_plan.py --plan plan.json --host 0.0.0.0   # LAN
# or expose a running deck publicly with a tunnel:
cloudflared tunnel --url http://localhost:<port>
```

## Develop

The deck UI is modular JS bundled into one offline file (no CDN, opens with
`file://`). Edit `src/`, then rebuild:

```bash
npm install
npm run build        # src/*.js -> templates/deck.html
npm run lint         # eslint
npm test             # build-drift check + lint + JS unit tests
npm run test:e2e     # Playwright browser e2e (needs Chromium)
```

```bash
# Python server tests
pip install -e ".[test]"
pytest               # HTTP e2e + unit
```

CI runs lint, a build-drift check (the committed `deck.html` must equal a fresh
build), JS unit tests and the Python suite on every push; the Playwright suite
runs when a browser is available.

## License

MIT © Dory Zidon
