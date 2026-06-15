import { test } from "node:test";
import assert from "node:assert/strict";
import { md, escapeHtml } from "../../src/md.js";

test("escapeHtml neutralizes markup", () => {
  assert.equal(escapeHtml("<b>&</b>"), "&lt;b&gt;&amp;&lt;/b&gt;");
});

test("md returns empty string for null/undefined", () => {
  assert.equal(md(null), "");
  assert.equal(md(undefined), "");
});

test("md renders bold, italic, code", () => {
  assert.match(md("**bold**"), /<strong>bold<\/strong>/);
  assert.match(md("*it*"), /<em>it<\/em>/);
  assert.match(md("`x`"), /<code>x<\/code>/);
});

test("md renders links with safe rel/target", () => {
  const out = md("[site](https://example.com)");
  assert.match(out, /<a href="https:\/\/example\.com" target="_blank" rel="noopener">site<\/a>/);
});

test("md renders unordered lists", () => {
  const out = md("- one\n- two");
  assert.match(out, /<ul><li>one<\/li><li>two<\/li><\/ul>/);
});

test("md renders fenced code blocks and preserves their content literally", () => {
  const out = md("```\na < b && c\n```");
  assert.match(out, /<pre class="code">a &lt; b &amp;&amp; c<\/pre>/);
});

test("md escapes HTML before applying rules (no injection)", () => {
  const out = md("<script>alert(1)</script>");
  assert.ok(!out.includes("<script>"));
  assert.match(out, /&lt;script&gt;/);
});

test("md wraps plain paragraphs and converts single newlines to <br>", () => {
  const out = md("line one\nline two");
  assert.match(out, /<p>line one<br>line two<\/p>/);
});
