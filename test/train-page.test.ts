// The train page's own wiring, without a browser: it reads the time from Rail's clock (so a test's railway and the
// page agree), and leaving it stops every timer even when opening it went wrong half way.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Rail } from "../src/core/rail";
import { fromLondon } from "../src/core/time";
import { TrainPage } from "../src/ui/pages/train";
import { parseHash } from "../src/ui/routes";
import { Clock, MemStorage, MemStore, pageContext, stations } from "./support";

// The live parts are stood in for: each records being started and stopped. The scene can be told to fail on start.
const made = vi.hoisted(() => ({ live: [] as Array<{ started: boolean; stopped: boolean }>, scene: [] as Array<{ stopped: boolean }>, sceneFails: false }));
vi.mock("../src/ui/live-train", () => ({
  LiveTrain: class {
    started = false;
    stopped = false;
    constructor() {
      made.live.push(this);
    }
    onAnswer() {}
    place() {}
    start() {
      this.started = true;
    }
    stop() {
      this.stopped = true;
    }
  },
}));
vi.mock("../src/ui/train-scene", async (original) => ({
  ...(await original<typeof import("../src/ui/train-scene")>()),
  TrainScene: class {
    stopped = false;
    constructor() {
      made.scene.push(this);
    }
    show() {}
    update() {}
    start() {
      if (made.sceneFails) throw new Error("the scene couldn't start");
    }
    stop() {
      this.stopped = true;
    }
  },
}));
vi.mock("../src/ui/widgets/tabs", () => ({ Tabs: class { wire() {} select() {} } }));

const NOON = fromLondon(2026, 11, 7, 12, 0);
const MIDNIGHT = fromLondon(2026, 11, 8, 0, 30);

/** Any element: answers every query with another one, so mount() can wire what it likes. */
const anyElement = (): HTMLElement => ({ dataset: {}, querySelector: () => anyElement() }) as unknown as HTMLElement;

let clock: Clock;
let rail: Rail;
let uid: string;
beforeEach(async () => {
  MemStorage.install();
  made.live.length = 0;
  made.scene.length = 0;
  made.sceneFails = false;
  vi.useFakeTimers({ now: MIDNIGHT }); // the device's clock says night...
  vi.stubGlobal("location", { hash: "#/train/x" });
  clock = new Clock(NOON); // ...while the railway (Rail's clock) is at noon
  rail = new Rail({ get: () => Promise.reject(new Error("no network")) }, new MemStore(), stations, clock.now);
  uid = (await rail.board({ station: "PAD", to: "OXF", when: NOON })).rows[0].uniqueId;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function openPage(): Promise<{ page: TrainPage; view: string; ctx: ReturnType<typeof pageContext> }> {
  const ctx = pageContext(rail);
  const page = new TrainPage(ctx, parseHash(`#/train/${uid}?at=PAD`));
  const view = String(await page.load(() => false));
  return { page, view, ctx };
}

describe("the train page's clock is Rail's", () => {
  it("the sky and the Recent entry follow Rail's clock, not the device's", async () => {
    const { page, view, ctx } = await openPage();
    expect(view).toContain('data-sky="day"');
    page.mount(anyElement());
    expect(ctx.trains.all()[0].seen).toBe(NOON);
    page.dispose();
  });
});

describe("leaving the train page", () => {
  it("stops the live train even if opening the page failed half way", async () => {
    made.sceneFails = true;
    const { page } = await openPage();
    expect(() => page.mount(anyElement())).toThrow(/couldn't start/);
    page.dispose();
    expect(made.live[0].stopped).toBe(true);
    expect(made.scene[0].stopped).toBe(true);
  });
});
