// Tiny offline markdown renderer (no CDN). Escapes HTML first, then applies a
// small, deterministic set of inline/block rules. Pure — exported for unit tests.

// NUL is used as a private placeholder for stashed code blocks while the rest
// of the markdown is transformed, then swapped back. It never appears in real
// text (escapeHtml leaves it alone, but it is not a character users type).
const NUL = String.fromCharCode(0);

/** Escape the HTML-significant characters so user/agent text can't inject markup. */
export const escapeHtml = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Render a restricted markdown subset to an HTML string. */
export const md = (src) => {
  if (src == null) return "";
  let s = escapeHtml(src);
  const stash = [];
  s = s.replace(/```\w*\n?([\s\S]*?)```/g, (_, c) => {
    stash.push(`<pre class="code">${c.replace(/\n$/, "")}</pre>`);
    return `${NUL}${stash.length - 1}${NUL}`;
  });
  s = s.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener">$1</a>');
  s = s.replace(/(^|\n)((?:[-*] .*(?:\n|$))+)/g, (_, pre, block) => {
    const items = block.trim().split(/\n/)
      .map((l) => `<li>${l.replace(/^[-*] /, "")}</li>`).join("");
    return `${pre}<ul>${items}</ul>`;
  });
  s = s.split(/\n{2,}/).map((p) =>
    new RegExp("^(<ul|<pre|" + NUL + ")").test(p.trim())
      ? p
      : `<p>${p.replace(/\n/g, "<br>")}</p>`
  ).join("");
  s = s.replace(new RegExp(NUL + "(\\d+)" + NUL, "g"), (_, i) => stash[+i]);
  return s;
};
