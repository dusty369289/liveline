// The train marker on the Route tab, between reports: it moves along by the timetable, even between rows close
// together (route-place.ts), rather than sitting still until the next report.
import { expect, ONCE, openTrain, test } from "./support";

test("between two passing points the marker moves along, not sat still till the next report", ONCE, async ({ page, errors }) => {
  // The 09:00 from Paddington, out past Slough, where a section runs between rows close together (a station and a
  // passing point, or two passing points): the old clear space at both ends left it nowhere to go (owner, 2026-11-08)
  await openTrain(page);
  const live = page.locator(".live");
  // On until it's running with a minute or more left of a section whose rows are under 2 × 26 px apart (polls land
  // as sections end near London, so the time left matters too)
  const left = () => live.evaluate((el) => {
    const d = (el as HTMLElement).dataset;
    const rows = [...el.querySelectorAll<HTMLElement>(".route__pt")];
    const [a, b] = [rows[Number(d.from)], rows[Number(d.to)]];
    if (d.state !== "running" || !a || !b || a.classList.contains("is-folded") || b.classList.contains("is-folded")) return 0;
    const close = b.getBoundingClientRect().top - a.getBoundingClientRect().top < 52;
    return close ? Number(d.expected) - Date.now() : 0;
  });
  // 30 s steps: half the polling work of 15 s ones (it timed out under the full suite's load), and the section it
  // finds runs three minutes, so a step can't pass it by
  for (let i = 0; i < 30 && (await left()) < 45_000; i++) await page.clock.runFor(30_000);
  expect(await left()).toBeGreaterThanOrEqual(45_000);
  const top = () => page.locator("[data-train-marker]").evaluate((el) => parseFloat((el as HTMLElement).style.top));
  const before = await top();
  await page.clock.runFor(30_000); // within the section: no report due, so this is the marker's own progress
  const after = await top();
  expect(after).toBeGreaterThan(before);
  void errors;
});
