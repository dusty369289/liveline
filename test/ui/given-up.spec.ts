// A train we've given up on (AGENTS.md, Polling and Your stop): long past when it was expected at its end with no report
// there. The simulator's trains always report, so these use a made-up RTT answer behind a made-up key (never a real one).
// The clock is 09:20 (support.ts); the train was due in at 08:10.
import type { Page } from "@playwright/test";
import { fakeService, type FakeLocation } from "../support";
import { audit, expect, snap, test } from "./support";

const route = (reported: boolean): FakeLocation[] => [
  { name: "Reading", crs: "RDG", dep: { gbtt: "07:30", wtt: "07:30", actual: reported ? "07:31" : undefined } },
  { name: "Twyford", crs: "TWY", arr: { gbtt: "07:37", wtt: "07:37", actual: reported ? "07:38" : undefined },
    dep: { gbtt: "07:38", wtt: "07:38", actual: reported ? "07:39" : undefined } },
  { name: "Maidenhead", crs: "MAI", arr: { gbtt: "07:44", wtt: "07:44" }, dep: { gbtt: "07:45", wtt: "07:45" } },
  { name: "Slough", crs: "SLO", arr: { gbtt: "07:51", wtt: "07:51" }, dep: { gbtt: "07:52", wtt: "07:52" } },
  { name: "London Paddington", crs: "PAD", arr: { gbtt: "08:10", wtt: "08:10" } },
];

async function openGivenUp(page: Page, reported: boolean): Promise<void> {
  await page.addInitScript(() => localStorage.setItem("rtt.key", "made-up-test-key"));
  await page.route("**/rtt/api/info**", (r) => r.fulfill({ json: { api_version: "2026-07-25", credentials: { entitlements: [] } } }));
  await page.route("**/rtt/gb-nr/service**", (r) => r.fulfill({ json: fakeService(route(reported)) }));
  await page.goto("/#/train/X12345:2026-11-07?at=SLO&to=PAD");
  await page.locator("[data-trainbar]").waitFor();
  await page.waitForTimeout(300);
}

test("train: reported on the way, never at its end", async ({ page, errors }, info) => {
  await openGivenUp(page, true);
  await expect(page.locator(".live")).toHaveAttribute("data-state", "unreported");
  await expect(page.locator(".live__hero-num")).toHaveCount(0);
  await expect(page.locator(".live__hero")).toContainText("timetable has it leaving at 07:52");
  expect(await audit(page)).toEqual([]);
  await snap(page, info, "18-train-unreported");
  void errors;
});

test("train: never reported", async ({ page, errors }, info) => {
  await openGivenUp(page, false);
  await expect(page.locator(".live")).toHaveAttribute("data-state", "no-data");
  await expect(page.locator(".live__hero-num")).toHaveCount(0);
  await expect(page.locator(".live__headline")).toContainText("times shown are the timetable");
  expect(await audit(page)).toEqual([]);
  await snap(page, info, "19-train-no-data");
  void errors;
});
