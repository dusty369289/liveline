// The search page's room above its heading (a tall phone, tabs at the bottom; owner, 2026-11-08): the train you're on,
// as the train page last counted it, with a way to stop showing it; otherwise the time and the day.
import { describe, expect, it } from "vitest";
import { fromLondon } from "../src/core/time";
import type { RecentTrain } from "../src/ui/store/recent-trains";
import { GLANCE_REFRESH_MIN, glanceRefreshDue, homeView } from "../src/ui/views/home";

const NOW = fromLondon(2026, 11, 8, 9, 20);
const M = 60_000;
const running: RecentTrain = {
  href: "#/train/C1:2026-11-08?at=PAD&to=OXF", title: "09:00 London Paddington to Oxford", ends: NOW + 40 * M, seen: NOW - 5 * M,
  glance: { verb: "reaches", stop: "Oxford", due: NOW + 42 * M, late: 7, asOf: NOW - M },
};
const view = (carry: RecentTrain | null) => String(homeView({ query: {}, carry, journeys: [], now: NOW }));

describe("the room above the search page's heading", () => {
  it("shows your train's big number as the train page last had it, counting on, and when that was", () => {
    const v = view(running);
    expect(v).toContain("Your train");
    expect(v).toMatch(/<a class="home__glance-go" href="#\/train\/C1:2026-11-08\?at=PAD&amp;to=OXF">/);
    expect(v).toContain(`data-count-at="${NOW + 42 * M}"`); // ticked on by the page, as on the train page
    expect(v).toContain(">42<");
    expect(v).toContain("until it reaches Oxford");
    expect(v).toContain("7 min late · as of 09:19");
  });

  it("has a button to stop showing it, named for what it does", () => {
    expect(view(running)).toMatch(/<button type="button" class="home__dismiss" data-dismiss-train="#\/train\/C1:2026-11-08\?at=PAD&amp;to=OXF" aria-label="Stop showing this train here"/);
  });

  it("has a small refresh beside it, which asks for this train again only once what's shown is a minute old", () => {
    expect(view(running)).toMatch(/<button type="button" class="home__refresh" data-refresh-train="#\/train\/C1:2026-11-08\?at=PAD&amp;to=OXF" aria-label="Refresh your train"/);
    expect(GLANCE_REFRESH_MIN).toBe(60);
    expect(glanceRefreshDue(NOW - 59_000, NOW)).toBe(false);
    expect(glanceRefreshDue(NOW - 60_000, NOW)).toBe(true);
  });

  it("with no train, or one whose time has gone, shows the time and the day instead", () => {
    for (const v of [view(null), view({ ...running, glance: { ...running.glance!, due: NOW - 3 * M } })]) {
      expect(v).not.toContain("Your train");
      expect(v).toContain('<span class="home__time tnum" data-clock>09:20</span>');
      expect(v).toContain("Sunday 8 November");
    }
  });

  it("a train with no saved number yet (opened by an older version) keeps the Carry on line, with the clock", () => {
    const v = view({ ...running, glance: undefined });
    expect(v).toContain("Carry on");
    expect(v).toContain("data-clock");
  });
});
