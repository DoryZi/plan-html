#!/usr/bin/env node
// Lint the deck's inline JavaScript.
//
// templates/deck.html is a single, hand-edited, offline file: its JS lives in a
// handful of labeled top-level <script> blocks (no build step, no modules). To
// lint that JS we extract every <script> block body, concatenate it into one
// temp .js file (preserving order so it reads like the page does), and run
// eslint over it. eslint.config.js has a matching block for the temp file.
//
// The PLAN/SAVED injection placeholders ({{PLAN_JSON}} / {{SAVED_ANSWERS}}) are
// not valid JS, so we replace them with harmless literals before linting — this
// only affects the temp file, never templates/deck.html.

import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..");
const DECK = join(REPO, "templates", "deck.html");
// ESLint's flat config only lints files inside the config's directory tree, so
// the extracted JS must live under the repo (gitignored), not in the OS tmpdir.
const TMP_DIR = join(REPO, ".lint-tmp");

/** Pull the body of every <script>...</script> block out of the deck HTML. */
function extractScriptBodies(html) {
  const bodies = [];
  const re = /<script>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html)) !== null) bodies.push(m[1]);
  if (bodies.length === 0) throw new Error("deck.html: no <script> blocks found");
  return bodies;
}

/** Make the extracted JS parseable: drop the server-side injection placeholders. */
function stripPlaceholders(js) {
  return js
    .replace("{{PLAN_JSON}}", "null")
    .replace("{{SAVED_ANSWERS}}", "null");
}

function main() {
  const html = readFileSync(DECK, "utf8");
  const js = stripPlaceholders(extractScriptBodies(html).join("\n"));

  mkdirSync(TMP_DIR, { recursive: true });
  const file = join(TMP_DIR, "deck.inline.js");
  writeFileSync(file, js);

  const eslintBin = join(REPO, "node_modules", ".bin", "eslint");
  const res = spawnSync(eslintBin, [file], { stdio: "inherit", cwd: REPO });
  rmSync(TMP_DIR, { recursive: true, force: true });
  process.exit(res.status ?? 1);
}

main();
