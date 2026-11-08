// Flip swaps a journey's two stations: on a board (the way back, at the same time) and in the search form (what's
// typed or picked). In place of saved journeys' Return (owner, 2026-11-08).
import { expect, ONCE, open, test } from "./support";

test("a board's flip opens the way back at the same time", ONCE, async ({ page, errors }) => {
  await open(page, "/board?station=PAD&to=OXF&time=09:00");
  await expect(page.locator(".board__sub")).toContainText("Calling at Oxford");
  await page.getByRole("link", { name: "Flip: Oxford to London Paddington" }).click();
  await expect(page.locator(".board__plate h1")).toHaveText("Oxford");
  await expect(page.locator(".board__sub")).toContainText("Calling at London Paddington · 09:00");
  await open(page, "/board?station=PAD&time=09:00");
  await expect(page.locator(".board__nav")).toBeVisible();
  await expect(page.locator(".board__flip")).toHaveCount(0); // one station: nothing to flip
  void errors;
});

test("the search form's flip swaps the two station boxes", ONCE, async ({ page, errors }) => {
  await open(page, "/");
  await page.locator("#station").fill("Reading (RDG)");
  await page.locator("#to").fill("Oxf");
  await page.getByRole("button", { name: "Swap the two stations" }).click();
  await expect(page.locator("#station")).toHaveValue("Oxf");
  await expect(page.locator("#to")).toHaveValue("Reading (RDG)");
  void errors;
});
