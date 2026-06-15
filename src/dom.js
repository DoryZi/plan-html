// DOM construction helpers + the shared lightbox. `el`/`mdEl` build elements;
// the lightbox helpers enlarge any mock or diagram. `el` is pure (given a DOM)
// and is exported for unit tests.

import { md } from "./md.js";

/** Create an element with an optional class and text content. */
export const el = (tag, cls, txt) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt != null) e.textContent = txt;
  return e;
};

/** Create a `<div class="md …">` whose innerHTML is rendered markdown. */
export const mdEl = (cls, src) => {
  const e = el("div", "md" + (cls ? " " + cls : ""));
  e.innerHTML = md(src);
  return e;
};

/**
 * Wire up the page's single lightbox overlay. Returns { openLightbox,
 * zoomableDiagram } used by cards/sections to enlarge mocks and diagrams.
 */
export const createLightbox = () => {
  const lightbox = document.getElementById("lightbox");
  const openLightbox = (title, fill) => {
    document.getElementById("lbTitle").textContent = title || "";
    const c = document.getElementById("lbContent");
    c.innerHTML = "";
    fill(c);
    lightbox.classList.add("show");
  };
  lightbox.addEventListener("click", (e) => {
    if (e.target === lightbox) lightbox.classList.remove("show");
  });
  document.getElementById("lbClose").addEventListener("click",
    () => lightbox.classList.remove("show"));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") lightbox.classList.remove("show");
  });
  const zoomableDiagram = (container, title) => {
    container.title = "Click to enlarge";
    container.addEventListener("click", () =>
      openLightbox(title, (c) => { c.innerHTML = container.innerHTML; }));
  };
  return { openLightbox, zoomableDiagram };
};
