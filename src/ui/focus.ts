// Keeping keyboard and screen-reader focus when part of the page is drawn again. New markup means new elements, and
// focus on a removed element falls back to the page's start: a poll or a refreshed board would throw you back there.
// So name the focused element by something the new markup repeats, and focus its twin afterwards.

/** Attributes that name an element in the next drawing too, best first. `name` covers form fields. */
const NAMED_BY = ["id", "name", "data-fold-toggle", "data-index", "data-tab"];

/** A selector that finds this element's twin in a fresh drawing of the same markup, or null if there's nothing to go on. */
export function focusKey(el: Element | null): string | null {
  if (!el || el === document.body) return null;
  for (const attr of NAMED_BY) {
    const v = el.getAttribute(attr);
    if (v != null) return `${el.tagName.toLowerCase()}[${attr}="${CSS.escape(v)}"]`;
  }
  const data = [...el.attributes].find((a) => a.name.startsWith("data-"));
  if (data) return `${el.tagName.toLowerCase()}[${data.name}="${CSS.escape(data.value)}"]`;
  const href = el.getAttribute("href");
  if (href) return `a[href="${CSS.escape(href)}"]`;
  return null;
}

/** Focus the element `key` names under `root`, without scrolling. False when it isn't there. */
export function refocus(root: ParentNode, key: string | null): boolean {
  const el = key ? root.querySelector<HTMLElement>(key) : null;
  if (!el) return false;
  el.focus({ preventScroll: true });
  return true;
}

/** Run `swap` (which replaces markup under `root`), then put focus back where it was, if it was in there. */
export function keepFocus(root: Element, swap: () => void): void {
  const active = document.activeElement;
  const key = active && root.contains(active) ? focusKey(active) : null;
  swap();
  if (key && !root.contains(document.activeElement)) refocus(root, key);
}
