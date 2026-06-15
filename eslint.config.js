// ESLint flat config.
//
// The deck (templates/deck.html) is a single hand-edited offline file whose JS
// lives in labeled top-level <script> blocks. scripts/lint-deck.js extracts
// those blocks into a temp `deck.inline.js` and runs eslint over it — that file
// is browser code sharing one global scope (esbuild-style `var` bindings), so
// it is linted as a non-module script with browser globals.
//
// scripts/*.js run in Node.
import js from "@eslint/js";

const browserGlobals = {
  window: "readonly", document: "readonly", localStorage: "readonly",
  fetch: "readonly", EventSource: "readonly", setTimeout: "readonly",
  clearTimeout: "readonly", requestAnimationFrame: "readonly",
  console: "readonly", performance: "readonly", URLSearchParams: "readonly",
};

const nodeGlobals = {
  process: "readonly", console: "readonly", URL: "readonly",
  __dirname: "readonly", Buffer: "readonly",
};

export default [
  js.configs.recommended,
  {
    // The deck's inline JS, extracted by scripts/lint-deck.js. One shared global
    // scope across the <script> blocks, so it is a classic (non-module) script.
    files: ["**/deck.inline.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: browserGlobals,
    },
    rules: {
      "no-unused-vars": ["error", { args: "none", varsIgnorePattern: "^_" }],
      "no-undef": "error",
      "prefer-const": "error",
      eqeqeq: ["error", "smart"],
    },
  },
  {
    files: ["scripts/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: nodeGlobals,
    },
    rules: {
      "no-unused-vars": ["error", { args: "none" }],
    },
  },
];
