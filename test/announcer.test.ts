// @vitest-environment happy-dom
// What a screen reader hears when the train page is polled: the headline when it changes, the big number when that
// changes, nothing when nothing did, and "Updated" when you asked and nothing changed.
import { beforeEach, describe, expect, it } from "vitest";
import { Announcer } from "../src/ui/widgets/announcer";

const live = (headline: string, hero = "") =>
  `<section class="live">${hero ? `<p class="live__hero"><span>${hero}</span> <span>min</span></p>` : ""}<p class="live__headline">${headline}</p></section>`;

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

  it("adds the big number when only it changed, collapsing its spacing", () => {
    poll(live("Between Slough and Reading", "11"));
    expect(note.textContent).toBe("Between Slough and Reading. 11 min");
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
