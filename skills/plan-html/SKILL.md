---
name: plan-html
description: "Interactive decision-deck planning. Same research/design thinking as /plan, but the plan is an interactive HTML deck the user works through in the browser — intent cards and decision cards, answered with buttons OR free text, with per-card questions to the agent — iterated in rounds until finalized. When the UI matters it designs in the same round: each question shows 2 or 3 options as strips of mock screens built on the real app's look and on earlier cycles, any of which opens full size with notes pinned to elements, and the intents and steps are written for the recommended option and follow the pick; one round is the norm. Works the same in Claude Code, Codex and Pi. Every answer autosaves, so interruptions lose nothing. Use whenever the user wants to plan, review, or iterate on a plan interactively instead of reading markdown in the terminal."
---

# Plan (HTML / interactive, round-based)

Research a codebase and design an implementation plan interactively. The
**review surface is the browser deck, not the terminal**. The plan is delivered as cards the user answers in place:
**intent cards** (what they want, in their words, editable) and **decision
cards** (forks in the design). Free text counts as a full answer; every card
can carry a question to the agent; rounds repeat until the user finalizes.
The user can also **reshape the plan directly**: add their own intents,
boundaries, decisions, or steps with a "+ Add" button per section, and strike
out any card (✕) to remove it. Added cards come back tagged `userAdded`;
struck cards simply vanish from the round.

## Running in Codex or Pi

Written for Claude Code. In Codex or Pi, follow it with three swaps (Pi finds this skill in
`~/.pi/agent/skills/plan-html`, Codex in `~/.agents/skills/plan-html`, both links to this folder):

- **Explore (Stage 2):** there are no parallel `Agent` calls. Explore the code yourself, or use Codex sub-agents if they are enabled.
- **Everything else is the same**, design first included: the mock screens are plain files you write, the deck
  shows them, and `check_prototype.py` runs the same everywhere, so every harness gives the user the same design.
- **Serve without `--live`, in the foreground:**
  `python3 "${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/skills/plan-html}/serve_plan.py" --plan <abs-path>/plan.json --timeout 1800`
  It opens the deck and blocks until the user sends the round, finalizes, or times out, then exits with the result. Handle it as in Round handling, rebuild `plan.json`, and serve again for the next round. Give the shell call a timeout above 1800 seconds.
- **No live Q&A inside the open page:** `Monitor`, `run_in_background` and answers streamed into the deck are Claude Code only. Questions typed in the deck arrive with the round; answer them in the next round's cards.

## HARD OUTPUT RULES — read first

1. **The deck IS the deliverable. Never print the plan as markdown in the
   terminal.** No plan dumps, no "here's a summary of the plan" walls of text,
   no markdown decision lists. Everything the user needs to read goes into
   `plan.json` and is rendered by the deck.
2. **Terminal output is status lines only**, a few short lines per round:
   what stage you're in, the deck URL, the round number, and (between rounds)
   a one-line note of what changed. Nothing else.
3. **Plans persist, in a cycle folder.** Every step of a project gets one folder, in
   order, like a chain of migrations: `<repo>/cycles/YYYY-MM-DD-NN-<slug>/`.
   Make it with
   `python3 "${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/skills/plan-html}/cycles.py" new --root <absolute repo path> --slug <slug>`
   (it picks NN, makes `.work/` and adds `cycles/*/.work/` to `.gitignore`). Inside:
   - `intent.md`, `spec.md` when the step has them; `plan.md`, the final plan builders
     execute (every card, its answer and discussion, steps, walk-throughs, design notes, final
     checks), and `plan.json`, the same plan as data, the reference plan.md points to (both
     written at Finalize; older cycles have `plan.json` and `decisions.md`);
     `discussions/` for any discussion the user saves during the step; `verify/` reports.
   - `.work/` (never committed): the live deck `.work/plan.json` with its answers and
     questions files, and any other working files.
   The cycle folder carries the date, so the files inside keep plain names.
   Never `/tmp`: the sibling `answers.json` autosave must survive reboots and be
   findable after an interrupted session.
4. **Never lose user input.** Before starting a round, check for an existing
   `answers.json` next to the plan — if present, the user has prior answers;
   the server preloads them automatically. On a `timeout` result, the
   autosaved answers are in the printed JSON (`saved`) — treat them as a
   partial round, don't discard them.

## Workflow

### Stage 0: Context from earlier cycles (default: always)

Earlier cycles are input to this one; start fresh only when the user says to ignore the past ("ignore past
cycles", "start from scratch"). Run
`python3 "${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/skills/plan-html}/cycles.py" context --root <absolute repo or project path>`
and read what it points at: each cycle's intent, plan.md (or decisions.md) and spec, the newest design (mock screens or a prototype), and the project's
other design folders (intent/, spec/, plan/, design/plans/, mocks/). Treat the new intent as a **change to what
exists**, not a new product: what was decided stays decided (do not ask it again), and when the new intent
conflicts with an earlier decision, raise it as a `needs-you` card ("Earlier you picked X; this implies Y. Which
wins?"). Show what you built on as `discovered[]` cards (`source`: the cycle folder or file) so the user can
strike what is out of date.

### Stage 1: Understand (chat, minimal)

Ask only what you need to scope the exploration — a couple of questions max.
The deep interrogation does NOT happen in chat: it happens in the deck
(Stage 3), where answers persist and the user can think. Do not proceed until
the user confirms the task framing.

**Does the UI matter?** When the work changes what the user sees or clicks (screens, flows,
tables, forms), the deck shows the design **and** the plan in one round (Stage 3a + 3b): every UI
question is 2 or 3 options, each a strip of mock screens the user clicks through, and the intents
and steps are written for the option you recommend and follow the pick. No separate design round
(too much back and forth). When the work plainly has no UI (a CLI, a backend job, a
refactor), skip 3a. When you cannot tell, ask once in chat.

### Stage 2: Explore (parallel agents)

Spawn explore agents in parallel (single message, multiple `Agent` calls),
sized to scope (1 small → 3–4 large), each returning structured markdown with
file paths and line numbers. Synthesize **briefly** (a few lines, not a
report), confirm with the user, then move on. Detailed findings belong in the
deck's card bodies, not the terminal.

### Stage 3a: Design first, as mock screens (when the UI matters)

The user designs by **seeing the flow**: each UI question shows 2 or 3 options, each a strip of up to 3 mock
screens with the click between them. Pick one and it is settled; the plan in the same deck follows it.

- **One round, everything in it.** The first deck already has the questions, their mock strips, and the
  intents, steps and checks written for the **recommended** option of each question (say which in the
  decision's `building`: "Recommended: C."). A pick of another option rewrites the intents and steps that
  assumed the recommendation (live, Stage 4; or on the next round). The user finalizes from that deck; a
  second round happens only if they send one. Never a design-only round followed by a plan round.
- **A pick is settled, once.** A picked screen means the whole screen as shown: every control on it is in
  scope and gets built, with the real behavior behind it, no follow-up questions about it. Write the
  intents and steps to cover all of it. Settled picks from earlier cycles (Stage 0) are never asked again;
  a later intent that conflicts with one raises a single `needs-you` card ("Earlier you picked X; this
  implies Y. Which wins?").
- **Mocks, not a working app** (the interactive part took too long and was not worth it). A
  screen is one small static HTML page with the app's real CSS and markup (copy `app.css`, the tokens, the
  fonts; rebuild the shell with the real class names) and the sample data written in. No behavior: the
  next screen in the strip shows what the click did. The one exception is free: the step's `click` (below)
  is ringed, and a click on it opens the next screen, so the user clicks through the flow ("otherwise, it's not super clear what the flow is"). Links are inert (`href="#"` or none); a mock that
  navigates fails the check. Build only the screens the strips need, a minute each; polish is not the point,
  the grouping and the flow are.
- **Files:** under the plan's `files/mocks/` (next to the live `plan.json`, so `.work/files/mocks/` in a
  cycle): one `.html` per screen (`<fork>-<key>-<n>.html`, `<walk-through>-<n>.html`), `app.css`, `fonts/`,
  and `proto-kit.js` (copy `templates/proto-kit.js` unchanged and load it last: on a static page it
  swallows clicks but the step's ringed one, and draws the user's pinned notes on their elements). Start from the newest design of an
  earlier cycle when Stage 0 found one (copy its `files/mocks/` or render its prototype's screens);
  otherwise from the real app (screenshot a development instance with demo data, never one with real data,
  and match it). The worked example is `examples/mocks/` in this skill.
- **Questions with options, each option a flow.** Every real fork in the UI is a decision with
  `"variant": "<fork>"` and 2 or 3 options (at most 4) that differ in the journey, not in looks.
  **Options must exclude each other: you would build only one.** Ask of every pair "could the product
  have both?" If yes, they are not options: several ways into the same thing are one flow with several
  entry points. A good question is about behavior the user lives with: "the app links on its own" vs
  "asks me first" vs "links when sure, asks when not". Each option is `{"key": "A", "label": "A. Search
  your mail", "caption": "<one line>", "steps": [{"title", "screen", "do", "click", "focus"}, …]}`: up to 3 steps
  (`screen` = the mock file under `files/`, `do` = what the user clicks on that step to reach the next, in
  words, `click` = that control on this screen: its visible words ("Attach", "2 to confirm") or a CSS
  selector; every step but the last needs one, `focus` = optional CSS selector to scroll into view for the
  screenshot). One click per step: a step that needs two ("open the email, then Attach") gets its own screen,
  or names the last click. Up to about 3 questions a deck.
- **What the user sees:** each question as a card with one row per option: its label and caption, then
  its steps as **screenshots** with the click ringed and arrows labeled with it, then **Try it** and **Pick**.
  **Try it** opens step 1 full size with the click ringed and a bubble saying what to do; a click on it opens
  the next screen, a click anywhere else does nothing. A click on a screenshot opens that screen full size
  at that step (‹ › move along the strip). There, **💬 Comment**
  (or C) lights up the element under the pointer; a click opens a note bubble pinned to that element; a
  click on a pin edits or deletes it. Pins show on the screenshots too. The card's text box is where the
  user mixes options ("start like A, confirm like B"): read it as the answer. An intent with `journey`
  shows that flow's screens next to its words and plays it with ▶ Show me.
- **Walk-throughs that are not choices** go in `design.journeys[]` (`{id, title, summary, steps}`) and show
  under "Also in this design" with **✓ Looks right** and **Not now**. They come back as `designReviews`
  (`[{journey, title, review: "ok" | "skip"}]`): a Looks right walk-through is built and checked (its
  intent stays), a Not now one leaves this build (its intent goes, a boundary says so).
- **Check before every round, after every change to the screens:**
  `python3 "${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/skills/plan-html}/check_prototype.py" --plan <abs path>/plan.json --phone`
  opens every screen (page errors, live links and sideways scroll at 390 fail; so do a step with no
  `click` or one its screen does not have, and a screen whose `proto-kit.js` is too old: copy it again) and
  saves the step screenshots the deck shows (`files/shots/`), each click ringed. It must print `MOCKS OK`. (First run on a machine:
  `uv run --with playwright playwright install chromium`.)
- **The deck:** `design.state: "open"`, `width`, `height`, `journeys`; the fork decisions among the other
  decisions; intents, steps and `finalVerify` as Stage 3b says. Boundaries never gate and can come later.
- **Notes come back as `designNotes`** with each round: `{id, route, routeFull, title, device, variants,
  element?, selector?, ex?, ey?, x?, y?, text, journey?, step?}` (`route` is the screen file). A note is a
  change request for that screen: change the mock, retake the shots, bump `rev`, and answer every note in
  `design.replies` (`{"<note id>": "Done: Undo is a button now"}`); `designNotesEarlier` is the history.
- **Picks arrive as they happen** (`{"action": "pick", "cardId", "choice"}` on the server's stdout, Stage 4):
  when a pick differs from the recommendation, rewrite the intents and steps for it right away, bump
  `rev`, write `plan.json`; the deck updates under the user while they go on.

**Opt-in: a clickable prototype.** Only when the user asks for one (a flow whose states a strip cannot
show). Then `design.prototype` names the entry file under `files/proto/`, steps use `route` (hashes,
`?scenario=` for a later state) instead of `screen`, `design.state: "shaping"` makes a design-only round
whose Finalize reads **Lock the design**, and `check_prototype.py` runs the full click check (every control
works or says it is outside the design; `PROTOTYPE OK`). The kit's header comment and `examples/prototype/`
describe it. Everything else above applies.

### Stage 3b: Plan → plan.json

Draft the plan **directly as `plan.json`** (schema below). After a locked design, every intent,
boundary and step traces back to a picked screen.

**Every plan MUST have a `goal`, `intents[]` with a `verify` per intent, a
plan-level `diagram`, and grill cards — no exceptions.** `boundaries[]` is
optional: include it when the task has real scope risk (things that must not
be touched, cost ceilings, "don't refactor X") and skip it for small
contained tasks. The user can drop any boundary with its "Not needed" button.

- **`goal` — one sentence that shouts what we're building and why.** Rendered
  as a highlighted banner at the top of the deck. If you can't write it in
  one sentence, the plan isn't understood yet.

- **GRILL THE USER — hard, but proportionate.** The round-1 deck must
  interrogate the user: turn every real assumption, ambiguity, and unstated
  requirement into a `needs-you` decision card. Cover (where they genuinely
  apply): who/what uses this, edge cases, failure modes, cost/limits,
  security, what NOT to build, and what "done" looks like. Challenge the
  user's framing when you disagree — present the conflict as a card with your
  counter-position in `building`/`tradeoffs`. If an answer comes back vague,
  re-ask it sharper in the next round; don't build on a vague answer.
  **Scale the grilling to scope and risk**: a contained task earns a handful
  of sharp cards, not an inquisition — never manufacture questions to fill
  the deck.

- **The loop must converge — balance looping against finishing.** Every
  round should shrink the open set, not grow it sideways. New cards in round
  N+1 are justified only by the user's answers or by re-exploration findings
  — not by second-guessing settled cards. When nothing real is left open,
  say so in the round-status line and let the user finalize; aim to be
  finalize-ready by round 2–3 for most plans. One round straight to Finalize
  is a success, not a shortcut.
- **`intents[]` — the spine of the plan.** An intent is **one outcome the
  user wants + why + how we prove it's done** — written in the user's own
  words (first person works well: "I want my answers to survive an
  interruption"). It is NOT a feature list and NOT an implementation step;
  if you can't attach a binary `verify` (method + exact command + expected
  result) to it, it's not an intent yet — sharpen it. Intents replace
  acceptance criteria; they are user-editable in the deck, so write them to
  be edited.
  - **Grill clarifying questions ON the intent (`agentQuestions[]`).** When an
    intent is fuzzy, attach pointed clarifying questions directly to it — who
    uses it, what "done"/"revert"/"approve" concretely mean, edge cases — and
    the deck renders them as an in-card checklist the user answers inline.
    Prefer this over spinning up a separate `needs-you` decision when the
    ambiguity is *about the intent itself*; use decision cards for genuine
    forks in the design. Answers come back in the round under the card's
    `grill[]` (each `{id, q, answer}`) — read them and tighten the intent (and
    its `verify`) next round. Soft-gated: unanswered grill questions are
    surfaced and counted but do NOT block Finalize.
- **`discovered[]` — what exploring turned up (optional, shown after the
  intents).** A finding from Stage 2 that changes or informs the plan: existing
  code that already does part of this, a constraint you didn't know about, an
  assumption that turned out wrong. Purely informational — no approve/reject,
  nothing to decide — so it never gates Finalize. Each card carries `finding`
  (what you found), and optionally `impact` (why it changes the plan) and
  `source` (where you found it, e.g. a file path). Only add one when it
  actually changes how the user should read the rest of the plan — not a
  running log of every file you opened.
- **`boundaries[]` — the fence (optional, shown after the intents).** What's in
  scope, what's out of scope, and what must not be touched. One boundary per
  card, written as a testable statement. When present, boundaries gate
  Finalize — the user must agree to each, rewrite it, or drop it.
- **Diagrams are REQUIRED.** Every plan ships a plan-level `diagram`
  (architecture/flow of what's being built). Additionally, any intent or
  decision that describes structure, flow, or sequence gets its own per-card
  `diagram` — if prose is explaining a shape, draw the shape instead.

  **Write a diagram as data: boxes and arrows, never coordinates.** The deck
  places the boxes, fits the text, colours them and draws the arrows.
  - `nodes[]`: one box per module or stage of the flow, in the order the work
    moves through them. `title` is 1 to 4 words; `sub` is one short line.
  - `kind` picks the colour and the small label: `screen` (something the user
    sees), `api` (an endpoint or service call), `data` (a file, table or
    store), `job` (background work), `agent`, `user` (a person acting),
    `external` (a system outside this build). Leave it out for a plain box.
  - `card`: the id of the intent, boundary, decision or step that decides or
    builds this box. A click on the box opens that card, so **link every box
    that has one**: the diagram is the map of the plan, its boxes are the
    plan's own steps and modules.
  - `col` and `row` (from 1) place a box. Leave both out on every box and the
    deck lays them out in order, five to a row. Set them when the flow has two
    lanes (for example the screen side on row 1, the back end on row 2).
  - `edges[]`: `["from", "to"]` or `["from", "to", "short label"]`. Label an
    arrow only where the flow isn't obvious. Prefer arrows between neighbours
    and between rows that touch; a long arrow across many boxes reads badly.
  - Up to about 10 boxes. A bigger flow is two diagrams: the plan-level one
    for the whole shape, a per-card one for the part that needs detail.

  A hand-drawn `diagramSvg` (with `diagramViewBox`) still renders, for an old
  plan or a shape the boxes cannot show (a timeline, a layout). Its classes:
  `node` (`alt1` to `alt4`), `node-label`, `node-sub`, `edge` with
  `marker-end='url(#arrow)'`, `edge-label`. When a plan has both, `diagram` wins.

- **UI work gets mocks — always, no exceptions.** A decision about a flow (what the user clicks, what
  opens) is a Stage 3a question: options as strips of mock screen files. A decision about one screen's
  look alone (a layout, a component) presents **2–3 alternative mocks inline as its options**: option
  objects `{"label", "caption", "html", "width", "height"}` for hi-fi HTML mocks (prefer these), or
  `{"label", "caption", "viewBox", "svg"}` for lo-fi wireframes (fallback). The deck renders `html` inline
  in a sandboxed, auto-scaled, zoomable iframe, in its own **"🎨 Design mocks"** section near the top.
  Either way the user picks a design by clicking a mock, not by imagining one from prose, and nothing goes
  out as attachments or links.

  - **MOCKS MUST LOOK LIKE THE PRODUCT WE ALREADY HAVE — this is the rule
    that matters most.** A mock that doesn't resemble the real app is worse
    than no mock: the user can't judge a layout that looks nothing like what
    they'll get. Before authoring any mock, the explore stage MUST have
    captured the app's actual look — its CSS custom properties / theme tokens
    (colors, radius, spacing), its real component classes (cards, tables,
    badges, buttons), and its font. **Default to hi-fi HTML** that pastes
    those real tokens into a self-contained `<style>` block and reuses the
    real class names and component shapes, so the mock is visually
    indistinguishable from a real screen of the app. If the app is dark, the
    mock is dark; if cards have a 1px `--border` and 8px radius, so does the
    mock. Populate with realistic sample data, not lorem/placeholders.
  - **HTML mock authoring (the default path):**
    - Self-contained `<!doctype html>` with an inline `<style>` — no external
      CSS, fonts, or scripts (the iframe is sandboxed and offline).
    - Copy the app's `:root{--…}` tokens verbatim and build with them; reuse
      the real component class names so the mock reads as the real UI.
    - Set `width`/`height` to a realistic screen size (e.g. `900×600`); the
      deck scales it down to fit. Author at full size — don't pre-shrink.
    - Same `width`/`height` across the 2–3 alternatives so they compare
      like-for-like; vary only the layout being decided.
  - **SVG wireframe fallback (only when there's no app look to match yet,
    e.g. a brand-new product with no styling):** lo-fi and blocky on purpose
    — `wf-frame` for the screen/panel outline, `wf-box` for outlined regions,
    `wf-fill`/`wf-accent` for the regions being decided, `wf-bar` for
    text-line placeholders, `wf-text` for region labels, `wf-note` for small
    annotations. Only these classes — no custom colors. Sizing discipline is
    mandatory or text overflows the frame (the common failure): keep ALL
    shapes and text strictly inside the `viewBox`; leave ~14px padding inside
    `wf-frame`; keep `wf-text` strings short (truncate, don't let them run
    past the box edge) and never start text near the left/right margin where
    it will clip. Same viewBox across the alternatives (~`0 0 200 140` for a
    screen, wider for dashboards).
  - Label every meaningful region so the differences between the 2–3 mocks
    are obvious at a glance; the `caption` states the tradeoff in one line
    ("denser, scales to 100 items" vs "calmer, 10 items max").
  - Mocks can sit alongside plain-string options on the same card (e.g. a
    third option "None of these — see my notes").
- **A change across 2 or more screens, or any journey the user will click through, is design
  first** (Stage 3a: a working prototype), not mocks. Mocks stay for a single layout pick.
- **`decisions[]` — the forks.** Any place the design could go more than one
  way: approach, library, boundary, what to defer, how much freedom the agent
  gets. Mark `needs-you` vs `agent-call` vs `fyi`. Use `dependsOn` to link a
  decision to the intents/decisions it hangs off — the deck shows the user
  their own answers on linked cards.
- **`steps[]`** — numbered implementation steps, each tagged with the intent
  it serves. Steps are derived: when a round changes an intent or decision,
  update the steps to match — they reshape every round and only lock at
  finalize. **Steps are now editable and deletable in the deck** like any
  card: the user can rewrite a step's fields in place, strike it out (✕) to
  delete it, or add their own. **The user's step edits are authoritative** —
  an edited step comes back with `userEdited: true` and its full `draft`;
  keep the user's wording, don't silently regenerate or override it. A step
  struck out is gone (absent from the round). You may still re-derive *other*
  steps when an intent/decision changes, but leave the user's edited/added
  steps as they set them unless their own answers force a change.
- **`finalVerify[]`** — the plan-level gate: for each intent, how the whole
  feature is proven end-to-end once built. **Editable in the deck** — the user
  can edit any row (intent / method / command / expected), add rows, or delete
  them. The edited rows ride back in the round as `finalVerify[]`; treat them
  as authoritative (keep the user's commands/expectations) and reconcile the
  plan's `finalVerify` to match. A new round reseeds the table from your
  updated plan.

### Stage 4: Serve LIVE — answer questions in place, no restart

**Default to live mode.** The deck stays open and you stay in a loop beside
it: the user can ask a question and get the answer **streamed back into the
same open page** — no close, no re-serve. The plan file is the single source
of truth; the page is a live view of it (SSE), and you keep it current.

1. **Serve in live mode — ALWAYS in the background:**

   ```bash
   python3 "${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/skills/plan-html}/serve_plan.py" --plan <abs-path>/cycles/YYYY-MM-DD-NN-<slug>/.work/plan.json --live
   ```

   **Run it with `run_in_background: true` — never foreground.** A
   foreground-blocking serve owns your turn, so the user can't type to you in
   the terminal until it yields. Background-serving keeps both channels open at
   once: the user types into the deck (autosaved + streamed to you) AND can
   still message you in the terminal. Poll the background server's output file
   for events between turns; don't block on it.

   **Stable port for tunnels (`--port`).** By default the server picks a random
   free port, so a `cloudflared` URL dies whenever the deck restarts. If the
   user is on a tunnel and you'll be restarting the deck (e.g. iterating on the
   template), pass `--port <fixed>` so the same tunnel URL keeps working across
   restarts. Otherwise omit it.

   **Don't miss the final event.** On **Finalize**/**Send to agent** the deck
   POSTs the round and the browser shows a "handed back to the agent — you can
   close this tab" page (it can't reliably close a user-opened tab, so the page
   IS the signal, not an auto-close). Because the server runs in the background,
   that round lands in the output file — actively pick it up. If a user says
   "I finalized but nothing happened," the round is in the server's stdout/log;
   read it and proceed.

   The deck opens; every user change autosaves to `answers.json`. The server
   prints a JSON line **per event** to stdout (it does NOT exit on the first
   one):
   - `{"action":"ask","id","cardId","text"}` — a live question (also queued in
     `questions.json`).
   - `{"action":"pick","cardId","choice"}` — a pick, the moment it is made (`choice` null: unpicked).
     On a design question this is planning while the user plans: when the pick differs from what the
     intents and steps assume, rewrite them for it now, bump `rev`, write `plan.json`; the deck updates
     in place. When the pick opens a real question ("You picked B: should To confirm also list the sure
     ones?"), add it as a new `needs-you` card in the same write: it floats up in the deck while the user
     goes on, and they answer it there. Never re-ask what the pick settled. Picks on other cards need
     nothing until the round. (From the bubble no agent watches the open deck: a pick's rewrite and any
     new question come with the next round, or at Finalize.)
   - the full round object on **Send to agent** / **Finalize plan**.
   - `{"action":"timeout",...}` if the idle timeout hits.

   - `{"action":"transcript","name","file","words"}` — the user pressed **Upload transcript** at the top of
     the deck and gave you a transcript of themselves talking about this work (a recording, a saved
     discussion; .txt, .md, .srt or .vtt). The server saved it under `transcripts/` next to the plan; `file`
     is its path. Read the whole file and **rebuild the deck from it now**, the way a finished interview
     rebuilds it (below): `goal`, `summary` and `intents[]` in their words, each with a real `verify`; what
     the transcript leaves open becomes `needs-you` cards; what it settles is not asked. New ids for changed
     cards; user-edited and user-added cards stay as the user set them. When the cycle has no `intent.md`,
     write it first: the user's words copied exactly (drop only timestamps and cue numbers), never a
     summary. Add `{"name", "file"}` to the plan's `transcripts[]`, bump `rev`, write `plan.json`; the open
     deck updates in place. A second upload adds to the first. The same goes for a transcript the user hands
     you in chat, also before any deck exists (Stage 1): read the file, build from it. A recording is
     transcribed first (the project's transcription tool).

   **The interview (discovery only).** Above the intents sits a panel with
   one button: "Interview me & redesign". It opens a popup in which **you
   ask the user questions to understand what they are building and why**,
   one at a time. The popup only collects; it never rebuilds. It is NOT a
   review of your own assumptions ("I assumed X, confirm?"), and it is NOT
   reading the cards back to them. Those are your problems to solve once you
   understand them; they become decision cards in the rebuilt deck.

   State lives on the plan and you are the only writer of it:

   ```jsonc
   "interview": {
     "state": "asking",          // idle | asking | done
     "max": 8,                   // rough cap shown to the user ("of about 8")
     "turns": [ {"id":"iv-1","q":"…","a":"…"} ],   // answered so far, in order
     "next": {"id":"iv-2","q":"…"},                 // the question on screen, or null
     "appliedRound": 2           // set when a round was rebuilt from these turns
   }
   ```

   Every user action arrives as an `ask` with `cardId:"__interview__"`:

   | `text` | Meaning | You do |
   |---|---|---|
   | `[INTERVIEW START]` | user pressed the button | set `state:"asking"`, `turns:[]`, write the first question into `next` |
   | anything else, with `id` = the current `next.id` | the answer to that question | append `{id,q,a}` to `turns`; write the following question into `next`. When you could already write the goal in their words, make the next question a wrap-up ("Anything else I should know before I redesign?") rather than stopping on your own |
   | `[INTERVIEW MORE]` | user wants more questions after `done` | set `state:"asking"` and write another `next`; keep `turns` |
   | `[INTERVIEW DONE]` (optionally followed by "Last answer (to: …)" and text) | user closed the interview | append the last answer if present, set `next:null`, `state:"done"`, write. **Do not rebuild now.** |

   After each of these: bump `rev`, write `plan.json`. The popup follows the
   plan over SSE; nothing else delivers your question.

   **How to ask.** One question at a time, plain words, each shaped by the
   previous answer. Dig into what they actually said; do not run a fixed
   list. Cover, in whatever order the conversation goes: what they want to
   be able to say or do when this is done; who it is for and who has to be
   convinced; what "done" and "wrong" look like; what they have already
   tried; what they will not spend (time, money, attention); what worries
   them. Around `max` questions, ask the wrap-up and let them press Done.

   **The rebuild happens on the next round, not in the popup.** When a
   `send-round` arrives and `plan.interview.state == "done"` with
   `appliedRound` missing or lower than the current round, regenerate the
   deck from the transcript plus the round's answers, not from the previous
   draft: rewrite `goal` and `summary` in their words; rewrite `intents[]`
   (each with a real `verify`); redraw `boundaries[]`; replace `decisions[]`
   with the forks the interview exposed (this is where your assumptions go,
   as `needs-you` cards); regenerate `steps[]`, `finalVerify[]` and the
   plan-level diagram. Bump `round`. Give changed cards **new ids** so stale
   answers do not attach to them; keep ids only for cards that genuinely
   survived unchanged, and keep any user-edited or user-added card as the
   user set it. Keep `interview.turns`, set `appliedRound` to the new round.
   Say in the one-line round status that the plan was rebuilt from the
   interview.

   **Serve with a long timeout** when an interview is likely
   (`--timeout 21600`): the default 1800 s is a total wall-clock limit, not
   idle, and an interview can outlast it.

   Legacy: an `ask` with `cardId:"__intents__"` and `[GRILL REQUEST]`, or
   `cardId:"__plan__"` and `[REDESIGN REQUEST]` (older decks), means: write
   pointed `agentQuestions[]` onto fuzzy intents, bump `rev`, write. No
   rebuild.

   **Optional public tunnel (on demand).** The deck binds `127.0.0.1` by
   default. If the user asks to share it / open it on their phone / "open a
   tunnel" **while a deck is already running**, start a `cloudflared` quick
   tunnel as a SEPARATE background process pointed at the live port — do NOT
   restart the server (that would not lose answers, but it's needless churn and
   changes the port):

   ```bash
   cloudflared tunnel --url http://localhost:<live-port> --no-autoupdate
   ```

   Grep its log for the `https://<random>.trycloudflare.com` URL and paste it
   to the user. The tunnel is ephemeral (URL changes each run, no account
   needed) and stays up until you stop the `cloudflared` process — stop it when
   the plan is done. (`ngrok http <port>` is an alternative if `cloudflared`
   isn't installed.)

2. **Arm a persistent Monitor the instant you serve — this is MANDATORY, not a
   poll.** Every deck event (ask, clarification, finalize, send-round, timeout)
   arrives on the server's stdout the microsecond it happens. Do NOT poll the
   output file between turns — that is what makes a question sit "queued — no
   agent is watching." Instead, the moment the background server is up, attach a
   **persistent Monitor** to its output file so each event wakes you instantly,
   with zero polling — the same instant path finalize already rides:

   ```
   Monitor(persistent: true, command:
     tail -n0 -f <server-output-file> |
       grep -E --line-buffered '"action": ?"(ask|pick|transcript|finalize|send-round|lock-design|timeout)"')
   ```

   With the Monitor armed, asks, clarifications and finalize are all delivered
   one uniform way, instantly. The deck shows an "agent is replying…" spinner on
   Send; if no reply lands in ~25s it flips to "no agent is watching this deck
   right now" — with the Monitor running, that state should essentially never
   appear. If it does, your Monitor died: re-arm it.

   **For each `ask` event — answer DURABLY (write the plan), then optionally
   paint fast (SSE push):**
   - Find the card by `cardId` and append to its `thread`:
     `{"role":"user","text":<their question>}` then your
     `{"role":"agent","text":<answer>}`.
   - Apply any plan change the answer implies (revise options, edit an intent,
     add/remove a card, redraw a diagram, reorder).
   - Bump `rev` and **write `plan.json`. This is the source of truth and the
     ONLY reliable delivery.** The server pushes the new plan over SSE and the
     page reconciles in place; crucially, the server also re-sends the full plan
     on every SSE (re)connect — so an answer written to the plan **survives a
     dropped mobile connection and reappears on reconnect.** An answer that is
     not in the plan is lost if the user's stream blipped (common on phones/
     tunnels). Never rely on the push alone.
   - **Optional instant paint:** you MAY also `POST /answer {cardId, text}` to
     stream the reply into the card a beat sooner. This is a nicety on top of the
     plan write, never a substitute — if you skip the plan write, a reconnect
     shows "still queued" forever even though you "answered."
   - Keep the Monitor armed until a `send-round`/`finalize`/`timeout` event.

   The user can keep working on other cards while you answer one — only the asked
   card shows a "thinking…" state. Don't block the whole plan on one question.

   **If an `ask` lands while you're busy elsewhere:** nothing is lost — it's
   queued in `<plan-stem>.questions.json` and the Monitor still fires. Pick it
   up; writing the plan delivers the answer (and heals any "queued" state) the
   moment the page next has the plan.

3. **On `send-round` / `finalize` / `timeout`** — proceed exactly as the
   round rules below describe. (Live answers and rounds coexist: live handles
   "answer my question now"; a round handles "I've answered a batch, process
   them.")

#### Round handling (also used by live edits)

2. **Read the printed round**
   (`{"action", "round", "agentActions", "cards":[...], "finalVerify":[...]}`).
   `finalVerify` carries the user's edited finish-line rows — reconcile your
   plan's `finalVerify` to match them.

   First check `agentActions` — the user's global requests for the next round:
   - `reexplore: true` — **re-run the exploration agents before answering
     anything**, then update affected cards (and say in one status line what
     changed in the code since last look).
   - `note` — free-text instruction for the next round; honor it.

   Cards arrive in the user's **priority order** (they drag-reorder by the ⠿
   grip): `cards[]` is sorted top-first and each carries `priority` (0 = most
   important within its section). Build in that order; let it set what you
   tackle first.

   **Struck-out cards are GONE — absent means removed.** When the user strikes
   a card (the ✕) it is dropped from the round entirely: it will NOT appear in
   `cards[]`. So a card you sent last round that is **missing this round was
   removed by the user** — drop it from the plan, don't re-add it, don't re-ask
   it. (You lose the "why" — accept the user's call.)

   **User-added cards arrive with `userAdded: true` and a `draft`.** The user
   created this card in the browser and may have filled it in fully or
   partially (`draft` holds whatever they typed: title, intent/boundary text,
   verify, options, status, step fields). **Promote it into the plan** as a
   real card next round: keep the user's content, complete what's missing
   (write a proper `verify` for an added intent, draw a diagram if it has
   structure, normalize options for an added decision), and give it a stable
   id. Treat the user's draft as authoritative intent — fill gaps, don't
   override.

   Then, for each card:
   - `choice` — a button pick (`approve` / `reject` / `agent` / a custom
     option label / a mock label). `null` is fine if `answer` has text:
     **free text is a full answer**, treat it with the same weight as a
     button. (The user can pick any text choice straight from the collapsed
     card via inline quick-answer buttons — same `choice` either way.)
   - `answer` — the user's own words: detail, redirect, or a standalone
     answer. Always read it; it overrides/refines the button.
   - `question` — the user needs an answer before deciding. **Answer it in
     the card's `thread`** (see below), don't make them dig in the terminal.
   - `thread` — the card's Q&A history (`[{role,text},…]`), present only when
     the card was discussed. **This is the reasoning behind the answer**: the
     questions the user asked and the answers given. Read it before acting on
     `choice`/`answer` — a pick often only makes sense given the discussion, and
     on finalize this is the record of WHY each decision went the way it did.
   - `designNotes` (top level, design-first decks) — the user's notes on the screens; handle
     them as Stage 3a says, and answer each note in `design.replies`. A question card's `answer`
     may mix its options ("start like A, check like B"): build that mix as the flow, or as a new
     option to compare next round.
   - `edit` — the user rewrote an intent or a boundary in place. Replace the
     card's text with their version (and adjust dependent decisions/steps/
     verify if the rewrite changes scope). An edited boundary is the user
     re-drawing the fence — re-check every step still fits inside it.

   **Keep the title in sync with the content.** A card's `title` is just a
   short handle — when discussion, an `edit`, a `question`, or your own rework
   changes what a card is actually about, **rewrite its `title` (and `summary`)
   to match.** Don't leave a stale title describing the old meaning. This
   applies to intents, boundaries, decisions, and steps alike: if the content
   moved, the title moves with it. (The deck reconciles the new title live over
   SSE, so the user sees it update in place.)

3. **If `action` is `"lock-design"`** (the prototype opt-in only) — the user agreed the design: set
   `design.state: "locked"`, write the plan from the prototype (Stage 3b), then serve the next round.

3. **If `action` is `"send-round"`** — iterate:
   - For every `question`, append to that card's `thread`:
     `{"role":"user","text":<their question>}` then
     `{"role":"agent","text":<your answer>}`.
   - Apply redirects: rejected decisions get reworked (new options or a
     changed design), edited intents get updated, ripple changes through
     steps and verify blocks.
   - Bump `"round"` by 1, write the updated `plan.json`, print **one line**
     saying what changed, and re-serve (step 1). The user's prior answers
     reload automatically; their delivered questions are cleared.

4. **If `action` is `"finalize"`** — first write the final plan:

   ```bash
   python3 "${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/skills/plan-html}/finalize_plan.py" --plan <live plan.json> --round <server output file>
   ```

   Leave `--out` off: for a live deck in a cycle's `.work/` the script writes the
   cycle's `plan.md` and `plan.json` (anywhere else, a dated `YYYY-MM-DD-<slug>-plan.md` and
   `-plan.json` next to the live plan), in seconds, with no model. It writes every card with its pick, typed answer, edit
   and Q&A, the steps, walk-throughs, design notes and the final checks table (verify reads it),
   and copies the live plan's `files/` (the mock screens or prototype included) into the cycle, so do not copy the
   round into extra files. Hand builders plan.md; it tells them to check plan.json when
   something is unclear (the live `.work/plan.json` stays a working file). An older cycle's final plan.json becomes a
   plan.md with `finalize_plan.py --plan <its plan.json>` (no `--round`). The picked screens are the target the build matches, and the
   next cycle starts from it. A follow-up round after a build writes the final file
   again (same path). Then briefly restate (2–4 lines max) what was decided where
   it diverged from your defaults, and proceed to build. After each step, run
   `/verify --cycle <step number>` against the final plan (and its intent/spec if
   any); fix FIX FIRST items before the next step. Do **not** re-dump the plan.

5. **If `action` is `"timeout"`** (exit code 1) — the user stepped away.
   Their partial answers are in `saved` and on disk. Say so in one line and
   stop; on the next session, re-serve the same plan — nothing is lost.

6. **More questions after finalize? Re-open the deck — never ask in the
   terminal.** Finalize locks the plan, but building often surfaces forks the
   plan didn't cover. When that happens: set `"followUp": true`, bump
   `round`, add ONLY the new `needs-you` cards (keep the locked sections for
   reference — don't re-open settled decisions), and re-serve. The deck shows
   a follow-up banner and the Finalize button becomes **"Resume build"** —
   in follow-up rounds only the new `needs-you` cards gate it; settled
   intents/boundaries stay locked and don't re-gate. (A follow-up intent or
   boundary can be marked `"status": "needs-you"` to gate again.)
   When the answers come back, continue building. Repeat as often as the
   build demands — a follow-up round is cheap; building on a guess isn't.

## plan.json schema

```jsonc
{
  "title": "Feature title",
  "slug": "feature-slug",                       // stable id; also the dir name
  "task": "the original request",               // optional
  "date": "YYYY-MM-DD",                          // optional
  "round": 1,                                    // bump on every re-serve
  "rev": 0,                                       // bump on every LIVE write so the open deck reconciles
  "followUp": false,                             // true = post-finalize round: new questions from the build
  "summary": "1–2 sentence what-and-why (markdown ok)",
  "goal": "REQUIRED — one sentence: what we're building and why, shown as a banner",

  "boundaries": [                                // optional — the fence, shown first when present
    {
      "id": "boundary-scope",
      "title": "Only the skill files change",
      "boundary": "In scope: the three skill files. Out of scope: everything under `src/`. Do **not** add new dependencies. (markdown ok)",
      "thread": []                               // Q&A history, optional
    }
  ],

  "intents": [                                   // REQUIRED — the spine, replaces AC
    {
      "id": "intent-persist",
      "title": "Answers survive interruptions",  // short card title
      "intent": "I want every answer I give to survive a closed tab, a timeout, or a reboot. (markdown ok)",
      "journey": "add-email",                      // optional, design first: the walk-through it comes from; its screens show next to the words, ▶ Show me plays it
      "verify": { "method": "e2e", "command": "…exact command…", "expected": "…observable result…" },
      "agentQuestions": [                          // optional — grill the user to sharpen this intent
        { "id": "scope", "q": "Does *every* answer include drag-order, or just card picks? (markdown ok)" }
      ],                                           // answers come back as grill:[{id,q,answer}] on the round
      "thread": [ {"role":"user","text":"…"}, {"role":"agent","text":"…"} ]  // Q&A history, optional
    }
  ],

  "discovered": [                                // optional — findings from exploring, shown after intents
    {
      "id": "found-ratelimiter",
      "title": "There's already a rate limiter",
      "summary": "middleware/throttle.py already does per-user limits",  // optional, shown on collapsed card
      "finding": "middleware/throttle.py already implements a token-bucket limiter per user. (markdown ok)",
      "impact": "The new endpoint should reuse it instead of adding a second one.",  // optional, markdown ok
      "source": "middleware/throttle.py",          // optional — where you found it
      "thread": []                                  // Q&A history, optional
    }
  ],

  "decisions": [
    {
      "id": "round-trip",
      "title": "How decisions return to the agent",
      "status": "needs-you",                     // needs-you | agent-call | fyi
      "summary": "one line shown on the collapsed card",
      "building": "what we're building for this decision (markdown ok)",
      "tradeoffs": ["**option A**: …", "**option B**: …"],   // optional, markdown ok
      "verify": "how we'll prove this was right",            // optional, string or {method,command,expected}
      "options": ["Blocking server", "Watched file"],        // optional; replaces Approve/Reject/Your-call
      // UI decisions: options are mock objects instead — the user clicks a mock to pick it.
      // These cards auto-render in the dedicated "Design mocks" section, expanded, zoomable.
      // PREFER hi-fi HTML that reuses the real app's theme tokens + component classes,
      // so the mock looks like the product. Same width/height across alternatives.
      // "options": [
      //   {"label":"Sidebar", "caption":"nav left, content right",
      //    "html":"<!doctype html><html><head><style>:root{/* paste app tokens */}…</style></head><body>…full mock reusing real classes…</body></html>",
      //    "width":900, "height":600},   // rendered inline, sandboxed, scaled, zoomable
      //   {"label":"Top tabs", "caption":"full-width content", "html":"…", "width":900, "height":600},
      //   // SVG wireframe is the lo-fi FALLBACK (only when there's no app look to match):
      //   {"label":"Lo-fi", "caption":"blocky wireframe", "viewBox":"0 0 200 140",
      //    "svg":"<rect class='wf-frame' x='4' y='4' width='192' height='132'/>…keep all text inside the box…"}
      // ],
      // A QUESTION of the design (Stage 3a): each option is a flow; the prototype shows option KEY with ?v=attach:KEY.
      // "variant": "attach", "variantLabel": "Attach",
      // "options": [{"key":"A", "label":"A. Search your mail", "caption":"Start on the company, search, attach.",
      //              "steps":[{"title":"Company", "route":"#/company/northwind", "do":"Add missing email"},
      //                       {"title":"Search your mail", "route":"#/company/northwind/add-email", "do":"Attach"},
      //                       {"title":"Linked, with Undo", "route":"#/company/northwind?scenario=linked"}]},
      //             {"key":"B", "label":"B. Paste and check", "caption":"…", "steps":[…]}],
      "dependsOn": ["intent-persist"],                       // optional; linked cards shown with the user's answers
      "thread": [],                                          // Q&A history, optional
      "diagram": { "nodes": […], "edges": […] }              // optional per-card diagram (intents too), same shape as the plan's
    }
  ],

  "steps": [                                     // read-only reference
    { "title": "Step title", "description": "what it does (markdown ok)",
      "files": "path/to/file", "test": "e2e", "intent": "intent-persist" }
  ],

  "finalVerify": [                               // plan-level gate, one row per intent
    { "intent": "intent-persist", "method": "e2e",
      "command": "…exact command…", "expected": "…observable result…" }
  ],

  "design": {                                     // design first (Stage 3a): mock screens, in the same deck as the plan
    "state": "open",                              // open (the default) | shaping (prototype opt-in: Finalize reads "Lock the design") | locked
    "width": 1280, "height": 800,                 // the desktop frame
    "journeys": [                                 // walk-throughs that are not choices ("Also in this design")
      {"id": "find", "title": "Find a job in the table", "summary": "…",
       "steps": [{"title": "Applications", "screen": "mocks/find-1.html", "do": "Open the Where menu, pick Remote"},
                 {"title": "Remote, by pay", "screen": "mocks/find-2.html"}]}
    ],
    "replies": {"n1x2": "Done: Undo is a button now"}   // your answer to each design note, by note id
    // prototype opt-in: "prototype": "proto/index.html", "start": "#/", and steps with "route": "#/jobs?scenario=x"
  },

  "diagram": {                                   // REQUIRED — plan-level architecture/flow diagram, drawn by the deck
    "nodes": [
      { "id": "form", "kind": "screen", "title": "Settings screen", "sub": "theme toggle", "card": "intent-toggle" },
      { "id": "save", "kind": "api", "title": "PATCH /settings", "sub": "per user", "card": "s-save" },
      { "id": "store", "kind": "data", "title": "users.theme", "card": "fork-storage" }
    ],
    "edges": [["form", "save"], ["save", "store", "on change"]]
  }
}
```

The deck also sends a global `agentActions` object with every round:
`{"reexplore": bool, "note": "free text"}` — the user's standing panel for
"re-explore the code before answering" and any other next-round instruction.

Notes:
- All prose fields render **markdown** (bold, italic, `code`, fenced blocks,
  bullet lists, links) — format the plan properly; don't write flat text.
- Intent cards and `needs-you` decisions count as **required** (the Finalize
  confirm names the ones still open; it never blocks); a card is satisfied by a
  button pick OR free text OR an in-place edit. Boundaries never count: they
  firm up as the plan does and can be added late. A struck card is gone from the
  final plan.
- `options` reads better than Approve/Reject when the decision is a concrete
  pick between named approaches.
- The diagram is data (`nodes` and `edges`); the deck draws it. No mermaid, no CDN.

## Rules

**DO:**
- Run every stage in order: context → understand → explore → (design first when the UI matters) → plan → serve.
- Grill hard in round 1: every real assumption becomes a card; vague answers
  get re-asked sharper, never built on — but scale it to scope, and never
  invent questions to keep the loop alive.
- Converge: each round shrinks the open set; when nothing real is left,
  recommend Finalize instead of another round.
- Always include `intents[]` (one outcome + why + verify each) and a
  plan-level diagram; add `boundaries[]` whenever scope needs a fence.
- Draw, don't describe: per-card diagrams for anything with structure, flow,
  or sequence — and 2–3 clickable wireframe mocks for every UI/layout
  decision, without being asked. When the UI matters, design first: a working
  prototype the user clicks through (Stage 3a), passing `check_prototype.py`.
- Honor `agentActions` every round — `reexplore` means re-run the explore
  agents before answering anything.
- Treat agreed boundaries as binding: if a later round would cross one,
  raise it as a new decision — don't silently widen scope.
- Surface every real fork as a decision with tradeoffs; link related cards
  with `dependsOn`.
- Answer every user question in the card's `thread` on the next round.
- Keep each card's `title`/`summary` in sync with its content — when the
  meaning changes, rewrite the title; never leave a stale handle.
- Serve in the background (`run_in_background: true`) so the user can type to
  you in the terminal AND into the deck at the same time.
- Start a `cloudflared` tunnel on demand (against the live port, no restart)
  when the user wants the deck public / on their phone.
- Use `uv run --directory` to launch `serve_plan.py` (per CLAUDE.md).

**DON'T:**
- Print the plan, findings, or decision lists as markdown in the terminal —
  the deck is the only plan surface.
- Auto-advance stages without approval, or skip the understanding phase.
- Write production/test code — that's the build phase's job.
- Mark a real fork `agent-call` just to avoid asking — if it changes what you
  build and you have no clear default, it's `needs-you`.
- Add external CDNs/scripts to the deck — it must open offline.
- Write mock files to disk or send mocks as attachments/links — every visual
  renders inline in the deck (svg/html options, diagrams). The only files are the
  design prototype, in the plan's `files/proto/`.
- Discard or overwrite `answers.json` — it's the user's work.
