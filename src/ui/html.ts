// A tiny escaping template: every value is HTML-escaped unless it's already Html (another template, or raw()).
// Train and station names come from RTT, so they're untrusted text: nothing reaches the page unescaped.
export class Html {
  constructor(readonly value: string) {}
  toString() {
    return this.value;
  }
}

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]);

function piece(v: unknown): string {
  if (v == null || v === false || v === true) return "";
  if (v instanceof Html) return v.value;
  if (Array.isArray(v)) return v.map(piece).join("");
  return escape(String(v));
}

export function html(strings: TemplateStringsArray, ...values: unknown[]): Html {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += piece(values[i]) + strings[i + 1];
  return new Html(out);
}

/** Only for markup written in this codebase, never for data. */
export const raw = (s: string) => new Html(s);

/** Put a view on screen. The only place the UI sets innerHTML, and only from escaped Html. */
export function render(target: Element, view: Html): void {
  target.innerHTML = view.value;
}

/** Parse a view without showing it, to swap parts of the page in place (a refreshed board or train). */
export function fragment(view: Html): DocumentFragment {
  const tpl = document.createElement("template");
  tpl.innerHTML = view.value;
  return tpl.content;
}
