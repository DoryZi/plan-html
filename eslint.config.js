// ESLint flat config. src/ is browser code (the deck), scripts/ and tests/js
// run in Node. Recommended rules plus a few project conventions.
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
    files: ["src/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
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
    files: ["scripts/**/*.js", "tests/js/**/*.js"],
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
