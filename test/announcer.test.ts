// @vitest-environment happy-dom
// What a screen reader hears when the train page is polled: the headline when its news changes, the hero line when its
// news changes, nothing when only the countdown or the clock times moved, and "Updated" when you asked and nothing did.
import { beforeEach, describe, expect, it } from "vitest";
import { build, type Position } from "../src/core/engine";
import { parseService } from "../src/core/parse";
import { fromLondon } from "../src/core/time";
import { Announcer, headlineKey } from "../src/ui/widgets/announcer";
import { fakeService, type FakeEvent } from "./support";

// One train, Alpha 10:00 - Beta 10:20/10:22 - Gamma 10:40/10:42 - Omega 11:00, seen by the engine as it would be on two
// polls: on time, then a minute later with every report a minute late
const clock = (h: number, m: number, s = 0) => fromLondon(2026, 11, 7, h, m) + s * 1000;
const hms = (h: number, m: number) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
const ev = (h: number, m: number, reported: boolean, late: number): FakeEvent =>
  ({ gbtt: hms(h, m), wtt: hms(h, m), actual: reported ? hms(h, m + late) : undefined });
// `upTo`: how many events (Alpha dep, Beta arr, Beta dep, Gamma arr, Gamma dep, Omega arr) have been reported
const position = (upTo: number, late: number, now: number): Position => {
  const e = (i: number, h: number, m: number) => ev(h, m, i < upTo, late);
  return build(parseService(fakeService([
    { name: "Alpha", crs: "AAA", dep: e(0, 10, 0) },
    { name: "Beta", crs: "BBB", arr: e(1, 10, 20), dep: e(2, 10, 22) },
    { name: "Gamma", crs: "GGG", arr: e(3, 10, 40), dep: e(4, 10, 42) },
    { name: "Omega", crs: "OOO", arr: e(5, 11, 0) },
  ]), () => now), now).position;
};
// For each state: what's reported, and when the first poll is (the second is a minute later, and late)
const AT = { running: [1, clock(10, 5)], "at-station": [2, clock(10, 20, 30)], arrived: [6, clock(11, 0, 30)] } as const;
const states = Object.keys(AT) as (keyof typeof AT)[];
const snapshots = (state: keyof typeof AT): [Position, Position] => {
  const [upTo, now] = AT[state];
  return [position(upTo, 0, now), position(upTo, 1, now + 60_000)];
};

// As liveRegion draws the hero: the number, "min", then what it's until (with its clock time and platform)
const live = (headline: string, hero = "", what = "until it leaves Reading · 09:40 · platform 9") =>
  `<section class="live">${hero ? `<p class="live__hero"><span class="live__hero-num">${hero}</span><span class="live__hero-unit">min</span>`
    + `<span class="live__hero-what">${what}</span></p>` : ""}<p class="live__headline">${headline}</p></section>`;

let region: HTMLElement;
let note: HTMLElement;
let a: Announcer;

beforeEach(() => {
  document.body.innerHTML = `<p data-refresh-note role="status"></p><div data-live-region>${live("Between Slough and Reading", "12")}</div>`;
  note = document.querySelector("[data-refresh-note]")!;
  region = document.querySelector("[data-live-region]")!;
  a = new Announcer(note, region); // what the page opened with counts as heard
});

const poll = (html: string, forced = false) => {
  region.innerHTML = html;
  a.heard(region, forced);
};

describe("the train page's announcer", () => {
  it("says nothing on a poll that changed nothing", () => {
    poll(live("Between Slough and Reading", "12"));
    expect(note.textContent).toBe("");
  });

  it("says the headline when it changes", () => {
    poll(live("At Reading, platform 9", "12"));
    expect(note.textContent).toBe("At Reading, platform 9");
  });

  it("says nothing when only the countdown number moved", () => {
    poll(live("Between Slough and Reading", "11"));
    expect(note.textContent).toBe("");
  });

  // The engine's own headlines, from position(): hand-copied ones would let a reworded headline make the page speak
  // on every poll with no test failing
  it.each(states)("says nothing when a train flips from on time to late (%s)", (state) => {
    const [before, after] = snapshots(state).map((p) => p.headline);
    region.innerHTML = live(before, "12");
    a = new Announcer(note, region);
    poll(live(after, "12"));
    expect(note.textContent).toBe("");
    poll(live(before, "12"));
    expect(note.textContent).toBe("");
  });

  it("says the whole hero line when its platform changes", () => {
    poll(live("Between Slough and Reading", "11", "until it leaves Reading · 09:40 · platform 10"));
    expect(note.textContent).toBe("Between Slough and Reading. 11 min until it leaves Reading · 09:40 · platform 10");
  });

  it("says the whole hero line when its clock time moves", () => {
    poll(live("Between Slough and Reading", "13", "until it leaves Reading · 09:42 · platform 9"));
    expect(note.textContent).toBe("Between Slough and Reading. 13 min until it leaves Reading · 09:42 · platform 9");
  });

  it("says the hero when the countdown turns to 'Due'", () => {
    poll(`<section class="live"><p class="live__hero"><span class="live__hero-num">Due</span><span class="live__hero-what">at Reading, platform 9</span></p>`
      + `<p class="live__headline">Between Slough and Reading</p></section>`);
    expect(note.textContent).toBe("Between Slough and Reading. Due at Reading, platform 9");
  });

  it("reads the page's own markup as words: no doubled full stop, and the number's parts kept apart", () => {
    // as liveRegion draws them: a headline ending in a full stop, and the hero's spans with nothing between
    poll(`<section class="live"><p class="live__hero"><span>37</span><span>min</span><span>until it reaches Oxford · 10:03</span></p>`
      + `<p class="live__headline">Left Slough 09:23. Next: Burnham.</p></section>`);
    expect(note.textContent).toBe("Left Slough 09:23. Next: Burnham. 37 min until it reaches Oxford · 10:03");
  });

  it("says 'Updated' when you asked and nothing changed, and nothing for the same again unasked", () => {
    poll(live("Between Slough and Reading", "12"), true);
    expect(note.textContent).toBe("Updated");
    note.textContent = "";
    poll(live("Between Slough and Reading", "12"));
    expect(note.textContent).toBe("");
  });

  it("doesn't repeat itself: the same news twice is said once", () => {
    poll(live("At Reading, platform 9", "12"));
    note.textContent = "";
    poll(live("At Reading, platform 9", "12"));
    expect(note.textContent).toBe("");
  });
});

describe("what counts as news in the engine's headlines", () => {
  it.each(states)("%s: the snapshots are that state, on time then late, with the same key", (state) => {
    const [before, after] = snapshots(state);
    expect([before.state, after.state]).toEqual([state, state]);
    expect(before.headline).toMatch(/on time/);
    expect(after.headline).toMatch(/1 min late/);
    expect(before.headline).not.toBe(after.headline);
    expect(headlineKey(after.headline)).toBe(headlineKey(before.headline));
  });

  it("the key changes when the state changes", () => {
    const keys = states.map((s) => headlineKey(snapshots(s)[0].headline));
    expect(new Set(keys).size).toBe(states.length);
  });

  it("the key changes when the train moves on to the next section, in the same state", () => {
    const leftAlpha = position(1, 0, clock(10, 5));
    const leftBeta = position(3, 0, clock(10, 25));
    expect([leftAlpha.state, leftBeta.state]).toEqual(["running", "running"]);
    expect([leftBeta.fromIndex, leftBeta.toIndex]).not.toEqual([leftAlpha.fromIndex, leftAlpha.toIndex]);
    expect(headlineKey(leftBeta.headline)).not.toBe(headlineKey(leftAlpha.headline));

    const atBeta = position(2, 0, clock(10, 20, 30));
    const atGamma = position(4, 0, clock(10, 40, 30));
    expect([atBeta.state, atGamma.state]).toEqual(["at-station", "at-station"]);
    expect(atGamma.fromIndex).not.toBe(atBeta.fromIndex);
    expect(headlineKey(atGamma.headline)).not.toBe(headlineKey(atBeta.headline));
  });
});
