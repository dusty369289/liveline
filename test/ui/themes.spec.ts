// The themes (Settings > Appearance): chosen there by their miniatures, kept, and every main page laid out properly in
// each, at both sizes and so in light and dark. Each page goes on the contact sheet, to be looked at.
import type { Page } from "@playwright/test";
import { THEMES } from "../../src/ui/store/appearance";
import { KEYS } from "../../src/ui/store/keys";
import { fakeService } from "../support";
import { audit, expect, open, openTrain, seedKey, snap, test } from "./support";

async function useTheme(page: Page, id: string): Promise<void> {
  await page.addInitScript(([name, value]) => localStorage.setItem(name, JSON.stringify(value)), [KEYS.theme, id]);
}

test("Operator colour is the theme until you choose another", async ({ page, errors }) => {
  await open(page, "/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "operator");
  void errors;
});

test("a theme chosen in Settings shows at once, is kept, and each choice is pictured in its own theme", async ({ page, errors }, info) => {
  await open(page, "/settings");
  const previews = page.locator(".themes .preview");
  await expect(previews).toHaveCount(THEMES.length);
  // each miniature wears its own theme, whichever the page is in
  for (const [i, [id]] of THEMES.entries()) await expect(previews.nth(i)).toHaveAttribute("data-theme", id);
  const bg = (i: number) => previews.nth(i).evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(new Set([await bg(0), await bg(1), await bg(2)]).size).toBe(3);
  expect(await audit(page)).toEqual([]);
  await snap(page, info, "40-settings-themes");

  const swiss = page.locator("input[name=theme][value=swiss]");
  await swiss.check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "swiss");
  await expect(swiss).toBeFocused(); // the page isn't drawn again under you
  await page.reload();
  await page.locator("main h1").waitFor();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "swiss");
  await expect(page.locator("input[name=theme][value=swiss]")).toBeChecked();
  void errors;
});

test("Operator colour: a train's header is its operator's colour made calm, not the brand at full strength", async ({ page, errors }, info) => {
  // TfW's brand is pure red, which glared across a whole header (owner, 2026-11-08). The simulator has no TfW
  // trains, so a made-up answer behind a made-up key.
  const answer = fakeService([
    { name: "Cardiff Central", crs: "CDF", dep: { gbtt: "09:00", wtt: "09:00", actual: "09:01" } },
    { name: "Newport (South Wales)", crs: "NWP", arr: { gbtt: "09:30", wtt: "09:30" }, dep: { gbtt: "09:31", wtt: "09:31" } },
    { name: "Abergavenny", crs: "AGV", arr: { gbtt: "09:55", wtt: "09:55" } },
  ]) as { service: { scheduleMetadata: { operator: { code: string; name: string } } } };
  answer.service.scheduleMetadata.operator = { code: "AW", name: "Transport for Wales" };
  await seedKey(page);
  await page.route("**/rtt/api/info**", (r) => r.fulfill({ json: { api_version: "2026-07-25", credentials: { entitlements: [] } } }));
  await page.route("**/rtt/gb-nr/service**", (r) => r.fulfill({ json: answer }));
  await page.goto("/#/train/X12345:2026-11-07?at=CDF&to=AGV");
  await page.locator("[data-trainbar]").waitFor();
  const head = await page.locator(".train__head").evaluate((el) => {
    const cs = getComputedStyle(el);
    return { bg: cs.backgroundColor, ink: cs.color };
  });
  expect(head).toEqual({ bg: "rgb(168, 55, 44)", ink: "rgb(255, 255, 255)" }); // operators.css: --op-head, not #ff0000
  expect(await audit(page)).toEqual([]);
  await snap(page, info, "45-operator-tfw-train");
  void errors;
});

for (const [id, name] of THEMES) {
  test(`${name}: search, board, train and settings lay out properly`, async ({ page, errors }, info) => {
    await useTheme(page, id);
    await open(page, "/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", id);
    expect(await audit(page), "search").toEqual([]);
    await snap(page, info, `41-${id}-search`);
    await open(page, "/board?station=PAD&to=OXF&time=09:00");
    expect(await audit(page), "board").toEqual([]);
    await snap(page, info, `42-${id}-board`);
    await openTrain(page);
    expect(await audit(page), "train").toEqual([]);
    await snap(page, info, `43-${id}-train`);
    await open(page, "/settings");
    expect(await audit(page), "settings").toEqual([]);
    await snap(page, info, `44-${id}-settings`);
    void errors;
  });
}
