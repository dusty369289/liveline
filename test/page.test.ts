// What every page shares: catching up when the app comes back (whenBack) is one listener, gated on being on screen,
// and gone when the page goes.
import { beforeEach, describe, expect, it } from "vitest";
import { Rail } from "../src/core/rail";
import { html } from "../src/ui/html";
import { Page } from "../src/ui/pages/page";
import { parseHash } from "../src/ui/routes";
import { FakeDocument, MemStore, pageContext, stations } from "./support";

class Probe extends Page {
  readonly tab = "home" as const;
  calls = 0;
  load = () => Promise.resolve(html``);
  override mount(): void {
    this.whenBack(() => { this.calls += 1; });
  }
}

let doc: FakeDocument;
beforeEach(() => {
  doc = FakeDocument.install();
});

const probe = () => {
  const rail = new Rail({ get: () => Promise.reject(new Error("no network")) }, new MemStore(), stations, () => 0);
  const p = new Probe(pageContext(rail), parseHash("#/"));
  p.mount();
  return p;
};

describe("whenBack", () => {
  it("runs when the page comes back on screen", () => {
    const p = probe();
    doc.fire("visibilitychange");
    expect(p.calls).toBe(1);
  });

  it("is skipped while the app is in the background", () => {
    const p = probe();
    doc.visibilityState = "hidden";
    doc.fire("visibilitychange");
    expect(p.calls).toBe(0);
  });

  it("stops listening when the page goes", () => {
    const p = probe();
    expect(doc.listening("visibilitychange")).toBe(1);
    p.dispose();
    expect(doc.listening("visibilitychange")).toBe(0);
    doc.fire("visibilitychange");
    expect(p.calls).toBe(0);
  });
});
