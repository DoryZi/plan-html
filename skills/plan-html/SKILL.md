---
name: plan-html
description: Interactive decision-deck planning. Same research/design thinking as /plan, but the plan is an interactive HTML deck the user works through in the browser — intent cards and decision cards, answered with buttons OR free text, with per-card questions to the agent — iterated in rounds until finalized. Every answer autosaves, so interruptions lose nothing. Use whenever the user wants to plan, review, or iterate on a plan interactively instead of reading markdown in the terminal.
---

<!-- experiment-banner:start -->
> 🧪 **This is an experiment** — part of [**AI Will Replace You**](https://doryzidon.com).
>
> **Stop wasting time on AI. I run practical experiments — real lessons you can use tomorrow, biweekly.**
>
> ▶ **[Watch the demo on YouTube](https://youtu.be/cFwvulWoTE4)** · 📖 **[Read the write-up](https://doryzidon.com/blog/stop-approving-plans-you-didnt-read)** · ✉️ **[Subscribe to the newsletter](https://www.linkedin.com/build-relation/newsletter-follow?entityUrn=7453650303100383232)**
>
> More on [@aiwillreplaceyou](https://youtube.com/@aiwillreplaceyou)
<!-- experiment-banner:end -->

# Plan (HTML / interactive, round-based)

Same goal as `/plan` — research a codebase and design an implementation plan
interactively — but the **review surface is the browser deck, not the
terminal**. The plan is delivered as cards the user answers in place:
**intent cards** (what they want, in their words, editable) and **decision
cards** (forks in the design). Free text counts as a full answer; every card
can carry a question to the agent; rounds repeat until the user finalizes.
The user can also **reshape the plan directly**: add their own intents,
boundaries, decisions, or steps with a "+ Add" button per section, and strike
out any card (✕) to remove it. Added cards come back tagged `userAdded`;
struck cards simply vanish from the round.

## HARD OUTPUT RULES — read first

1. **The deck IS the deliverable. Never print the plan as markdown in the
   terminal.** No plan dumps, no "here's a summary of the plan" walls of text,
   no markdown decision lists. Everything the user needs to read goes into
   `plan.json` and is rendered by the deck.
2. **Terminal output is status lines only**, a few short lines per round:
   what stage you're in, the deck URL, the round number, and (between rounds)
   a one-line note of what changed. Nothing else.
3. **Plans persist.** Write `plan.json` to
   `<repo>/design/plans/<slug>/plan.json` (gitignored — verify; add
   `design/plans/` to `.gitignore` if missing). Never `/tmp`: the sibling
   `answers.json` autosave must survive reboots and be findable after an
   interrupted session.
4. **Never lose user input.** Before starting a round, check for an existing
   `answers.json` next to the plan — if present, the user has prior answers;
   the server preloads them automatically. On a `timeout` result, the
   autosaved answers are in the printed JSON (`saved`) — treat them as a
   partial round, don't discard them.

## Workflow

### Stage 1: Understand (chat, minimal)

Ask only what you need to scope the exploration — a couple of questions max.
The deep interrogation does NOT happen in chat: it happens in the deck
(Stage 3), where answers persist and the user can think. Do not proceed until
the user confirms the task framing.

### Stage 2: Explore (parallel agents)

Spawn explore agents in parallel (single message, multiple `Agent` calls),
sized to scope (1 small → 3–4 large), each returning structured markdown with
file paths and line numbers. Synthesize **briefly** (a few lines, not a
report), confirm with the user, then move on. Detailed findings belong in the
deck's card bodies, not the terminal.

### Stage 3: Design → plan.json

Draft the plan **directly as `plan.json`** (schema below).

**Every plan MUST have a `goal`, `intents[]` with a `verify` per intent, a
plan-level `diagramSvg`, and grill cards — no exceptions.** `boundaries[]` is
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
- **`boundaries[]` — the fence (optional, shown after the intents).** What's in
  scope, what's out of scope, and what must not be touched. One boundary per
  card, written as a testable statement. When present, boundaries gate
  Finalize — the user must agree to each, rewrite it, or drop it.
- **Diagrams are REQUIRED.** Every plan ships a plan-level `diagramSvg`
  (architecture/flow of what's being built). Additionally, any intent or
  decision that describes structure, flow, or sequence gets its own per-card
  `diagramSvg` — if prose is explaining a shape, draw the shape instead.

  **Diagram authoring rules (the deck styles these classes — use them):**
  - `class="node"` boxes (bright blue). Color-code stages with the variants
    `node alt1` (teal), `node alt2` (amber), `node alt3` (purple),
    `node alt4` (rose) — e.g. inputs teal, processing blue, outputs amber.
  - Titles use `class="node-label"` (white, bold); secondary lines use
    `class="node-sub"` (light blue) — never invent your own fills/colors.
  - Edges: `class="edge"` with `marker-end='url(#arrow)'`; label them with
    `class="edge-label"` where the flow isn't obvious.
  - **Size the viewBox to the content** — ~20px of padding around the
    outermost shapes, no oceans of empty space. Nodes ~140×48 with ~60px
    horizontal gaps read well.

- **UI work gets mocks — always, no exceptions.** Any decision about a
  screen, page, layout, component, or visual flow MUST present **2–3
  alternative mocks as its options** — the user picks a design by clicking a
  mock, not by imagining one from prose. Use option objects (see schema):
  `{"label", "caption", "html", "width", "height"}` for **hi-fi HTML mocks
  (default — prefer these)**, or `{"label", "caption", "viewBox", "svg"}` for
  lo-fi SVG wireframes (fallback only). The deck renders `html` inline in a
  sandboxed, auto-scaled, zoomable iframe.
  **Inline only — NEVER as files.** Do not write mock `.html`/`.png` files to
  disk, do not send mocks as attachments, do not link out. If a visual is not
  inside the deck card, it does not count as delivered. Mock decisions
  automatically render in their own prominent **"🎨 Design mocks"** section
  near the top, expanded by default — you don't need to do anything beyond
  using option objects.

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
   # ${CLAUDE_PLUGIN_ROOT} resolves to this skill's install dir (plugin install).
   # If you cloned manually instead, use that path, e.g. ~/.claude/skills/plan-html
   python3 "${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/skills/plan-html}/serve_plan.py" \
     --plan <abs-path>/design/plans/<slug>/plan.json --live
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
   - the full round object on **Send to agent** / **Finalize plan**.
   - `{"action":"timeout",...}` if the idle timeout hits.

   **Grill request.** The intents section has an "Interview me to sharpen
   these intents" button. Clicking it sends an `ask` with
   `cardId:"__intents__"` and a `text` starting `[GRILL REQUEST]`. When you see
   it: write pointed `agentQuestions[]` onto the fuzzy/ambiguous intents (not
   every intent — only ones that genuinely need clarifying), bump `rev`, and
   write `plan.json`. The questions stream into the cards over SSE; the user
   answers inline and the answers come back as `grill[]` (see `agentQuestions`
   under intents). This is grilling on demand — the user pulls it when they
   want it, instead of you front-loading questions on every intent.

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
       grep -E --line-buffered '"action": ?"(ask|finalize|send-round|timeout)"')
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

4. **If `action` is `"finalize"`** — briefly restate (2–4 lines max) what was
   decided where it diverged from your defaults, then proceed to build (or
   hand to `/dev-cycle`). Do **not** re-dump the plan.

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
      "verify": { "method": "e2e", "command": "…exact command…", "expected": "…observable result…" },
      "agentQuestions": [                          // optional — grill the user to sharpen this intent
        { "id": "scope", "q": "Does *every* answer include drag-order, or just card picks? (markdown ok)" }
      ],                                           // answers come back as grill:[{id,q,answer}] on the round
      "thread": [ {"role":"user","text":"…"}, {"role":"agent","text":"…"} ]  // Q&A history, optional
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
      "dependsOn": ["intent-persist"],                       // optional; linked cards shown with the user's answers
      "thread": [],                                          // Q&A history, optional
      "diagramSvg": "<rect class='node' …/>…",               // optional per-card diagram (intents too)
      "diagramViewBox": "0 0 720 240"
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

  "diagramSvg": "<rect class='node' …/>…",       // REQUIRED — plan-level architecture/flow diagram
  "diagramViewBox": "0 0 720 240"                // optional
}
```

The deck also sends a global `agentActions` object with every round:
`{"reexplore": bool, "note": "free text"}` — the user's standing panel for
"re-explore the code before answering" and any other next-round instruction.

Notes:
- All prose fields render **markdown** (bold, italic, `code`, fenced blocks,
  bullet lists, links) — format the plan properly; don't write flat text.
- Boundary cards (when present), intent cards, and `needs-you` decisions
  **gate Finalize**; a card is satisfied by a button pick OR free text OR an
  in-place edit. Open questions also block Finalize (they must be answered in
  a round first). A boundary answered "Not needed — drop it" is removed from
  the next round's plan.
- `options` reads better than Approve/Reject when the decision is a concrete
  pick between named approaches.
- The diagram is hand-authored inline SVG (same node/edge classes as before).
  No mermaid, no CDN.

## Rules

**DO:**
- Run the same understand → explore → design stages as `/plan`; only the
  output surface differs.
- Grill hard in round 1: every real assumption becomes a card; vague answers
  get re-asked sharper, never built on — but scale it to scope, and never
  invent questions to keep the loop alive.
- Converge: each round shrinks the open set; when nothing real is left,
  recommend Finalize instead of another round.
- Always include `intents[]` (one outcome + why + verify each) and a
  plan-level diagram; add `boundaries[]` whenever scope needs a fence.
- Draw, don't describe: per-card diagrams for anything with structure, flow,
  or sequence — and 2–3 clickable wireframe mocks for every UI/layout
  decision, without being asked.
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
  renders inline in the deck (svg/html options, diagrams), full stop.
- Discard or overwrite `answers.json` — it's the user's work.
