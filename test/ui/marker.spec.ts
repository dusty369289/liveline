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

// Owner, 2026-11-09: passing points can come four to a minute, between two polls. The marker runs on past one that
// hasn't reported yet, by the timetable, drawn dashed as our guess, rather than sitting until the next answer.
test("past a passing point that hasn't reported yet, the marker runs on, dashed", ONCE, async ({ page, errors }) => {
  await openTrain(page);
  const live = page.locator(".live");
  // on until it's heading for a passing point with another after it
  const heading = () => live.evaluate((el) => {
    const d = (el as HTMLElement).dataset;
    const rows = [...el.querySelectorAll<HTMLElement>(".route__pt")];
    const to = Number(d.to);
    const pass = (r?: HTMLElement) => !!r && r.classList.contains("is-pass") && !r.classList.contains("is-folded");
    const due = Number(rows[to]?.dataset.tIn); // the time shown on its row, which the marker runs by
    return d.state === "running" && pass(rows[to]) && pass(rows[to + 1]) && due > Date.now() ? due - Date.now() : -1;
  });
  let wait = -1;
  for (let i = 0; i < 30 && (wait = await heading()) < 0; i++) await page.clock.runFor(30_000);
  expect(wait).toBeGreaterThanOrEqual(0);
  const to = Number(await live.getAttribute("data-to"));
  await page.clock.runFor(wait + 5000); // 5 s after it was due there: before the poll (20 s after), so no report yet
  expect(Number(await live.getAttribute("data-to"))).toBe(to); // still no report there
  const [marker, row] = await page.evaluate((i) => {
    const wrap = document.querySelector(".route-wrap")!.getBoundingClientRect().top;
    // where the point's tick is, as the marker reads it (live-marker.ts, rowCentre): the first line, not the row's middle
    const row = document.querySelectorAll<HTMLElement>(".route__pt")[i];
    const mark = row.querySelector(".route__mark")!;
    const tick = mark.getBoundingClientRect().top - wrap + parseFloat(getComputedStyle(mark, "::after").top);
    return [parseFloat(document.querySelector<HTMLElement>("[data-train-marker]")!.style.top), tick];
  }, to);
  expect(marker).toBeGreaterThan(row);
  await expect(page.locator("[data-train-marker]")).toHaveClass(/is-estimated/);
  void errors;
});
