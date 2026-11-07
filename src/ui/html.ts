// A tiny escaping template: every value is HTML-escaped unless it's already Html (another template, or raw()).
// Train and station names come from RTT, so they're untrusted text; this is what Jinja's autoescape did before.
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

/** Query string for a hash route, dropping empty values. */
export function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== "" && v != null && v !== false) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}
