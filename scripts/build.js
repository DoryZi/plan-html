#!/usr/bin/env node
// Build the deck: bundle src/main.js (ES modules) into the single inline
// <script> of templates/deck.html, keeping the file self-contained and offline
// (no CDN, no external src). Run with no args to write; with --check to verify
// the committed deck.html equals a fresh build (CI drift gate).
//
// PLAN/SAVED injection contract (serve_plan.py depends on this):
//   serve_plan.py does an anchored string replace on these two EXACT lines,
//   and raises if either is missing or not present exactly once:
//
//       let PLAN = {{PLAN_JSON}};
//       const SAVED = {{SAVED_ANSWERS}};
//
//   So the emitted <script> must contain those two lines, verbatim, once each.
//   We prepend them (as the literal anchor text) ahead of the bundled IIFE,
//   then bridge them onto window.* so main.js can read window.PLAN/window.SAVED.
//   The bundle is an IIFE (its own scope), so it can't see the top-level
//   `let`/`const`; the explicit window assignment is the clean hand-off.

import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..");
const ENTRY = join(REPO, "src", "main.js");
const DECK = join(REPO, "templates", "deck.html");

// The two anchor lines serve_plan.py substitutes — emitted verbatim, once each.
const ANCHOR_PLAN = "let PLAN = {{PLAN_JSON}};";
const ANCHOR_SAVED = "const SAVED = {{SAVED_ANSWERS}};";

/** Bundle src/main.js into a single IIFE string (no sourcemap in the shipped file). */
async function bundleJs() {
  const result = await build({
    entryPoints: [ENTRY],
    bundle: true,
    format: "iife",
    sourcemap: false,
    write: false,
    legalComments: "none",
    charset: "utf8",
  });
  return result.outputFiles[0].text;
}

/** Compose the full inline <script> body: anchor lines + window bridge + bundle. */
function composeScriptBody(bundled) {
  return [
    "",
    "  " + ANCHOR_PLAN,
    "  " + ANCHOR_SAVED,
    "  window.PLAN = PLAN; window.SAVED = SAVED;",
    bundled.replace(/\n$/, ""),
    "",
  ].join("\n");
}

/** Replace the body between the first <script> and its closing </script>. */
function injectIntoDeck(html, scriptBody) {
  const openTag = "<script>";
  const closeTag = "</script>";
  const start = html.indexOf(openTag);
  if (start === -1) throw new Error("deck.html: no <script> tag found");
  const bodyStart = start + openTag.length;
  const end = html.indexOf(closeTag, bodyStart);
  if (end === -1) throw new Error("deck.html: no closing </script> tag found");
  return html.slice(0, bodyStart) + scriptBody + html.slice(end);
}

async function main() {
  const check = process.argv.includes("--check");
  const bundled = await bundleJs();
  const scriptBody = composeScriptBody(bundled);
  const current = readFileSync(DECK, "utf8");
  const next = injectIntoDeck(current, scriptBody);

  // Sanity: the anchor lines must survive exactly once each.
  for (const anchor of [ANCHOR_PLAN, ANCHOR_SAVED]) {
    const count = next.split(anchor).length - 1;
    if (count !== 1) {
      throw new Error(`anchor ${JSON.stringify(anchor)} appears ${count} times in output (expected 1)`);
    }
  }

  if (check) {
    if (next !== current) {
      console.error("✗ deck.html is out of date — run `npm run build`.");
      console.error("  The committed templates/deck.html does not match a fresh build of src/.");
      process.exit(1);
    }
    console.log("✓ deck.html matches a fresh build of src/.");
    return;
  }

  writeFileSync(DECK, next);
  console.log("✓ built templates/deck.html from src/.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
