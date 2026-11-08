// Station, train and operator names come from RTT: untrusted text. The escaping template (src/ui/html.ts) is what
// keeps them from becoming markup, so it's tested directly and through a real view.
import { describe, expect, it } from "vitest";
import { Rail } from "../src/core/rail";
import { SimTransport } from "../src/core/simulator";
import { fromLondon } from "../src/core/time";
import { html, raw } from "../src/ui/html";
import { boardView } from "../src/ui/views/board";
import { MemStore, stations } from "./support";

const HOSTILE = `<img src=x onerror=1>`;
const QUOTES = `"'&`;

describe("the escaping template", () => {
  it("escapes a value meant to become a tag", () => {
    expect(html`<p>${HOSTILE}</p>`.value).toBe("<p>&lt;img src=x onerror=1&gt;</p>");
  });

  it("escapes quotes and ampersands, so a value can't leave an attribute", () => {
    expect(html`<a title="${QUOTES}">`.value).toBe(`<a title="&quot;&#39;&amp;">`);
  });

  it("escapes inside arrays, and passes nested templates and raw() through once", () => {
    expect(html`${[HOSTILE, html`<b>${QUOTES}</b>`, raw("<i>")]}`.value)
      .toBe("&lt;img src=x onerror=1&gt;<b>&quot;&#39;&amp;</b><i>");
  });
});

describe("a view with hostile names", () => {
  it("a board escapes the station, destination and operator RTT sent", async () => {
    const now = fromLondon(2026, 11, 7, 9, 0);
    const sim = new SimTransport(() => now);
    const rail = new Rail(sim, new MemStore(), stations, () => now);
    await rail.setKey("k".repeat(40));
    const res = await rail.board({ station: "PAD" });
    expect(res.rows.length).toBeGreaterThan(0);
    res.board.stationName = HOSTILE;
    res.rows[0] = { ...res.rows[0], destination: HOSTILE, operatorName: QUOTES };
    const nav = { earlier: "#e", later: "#l", refresh: "#r", switch: "#s", all: "#a", change: "#c" };
    const out = boardView(res, nav, true, now).value;
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;img src=x onerror=1&gt;");
    expect(out).toContain("&quot;&#39;&amp;");
  });
});
