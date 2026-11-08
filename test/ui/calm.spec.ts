// Calm pages: the answer first, each fact said once, few controls in view, small print only where it's wanted.
// These hold the cuts made for that (2026-11-07): judging the whole look is still the contact sheet's job.
import { expect, open, openTrain, test } from "./support";

test("the train page says each thing once: no restating a stop it has passed, no trivia up top", async ({ page, errors }) => {
  await openTrain(page); // running, past Paddington
  const status = page.locator(".live__status");
  await expect(status).not.toContainText("It has left");
  await expect(status).not.toContainText("Lost most time");
  await expect(page.locator(".route-wrap ~ .live__aside, .live__aside")).toContainText("Lost most time"); // moved below the route
  void errors;
});

test("the train's header is one line of facts; class and unit live in the Train view", async ({ page, errors }) => {
  await openTrain(page);
  await expect(page.locator(".train__head .label")).not.toContainText("Class");
  await expect(page.locator(".train__head .hint")).toHaveCount(0);
  await page.getByRole("tab", { name: "Train view" }).click();
  await expect(page.locator("[data-formation-note]")).toContainText(/Class 800, unit \d+/);
  void errors;
});

test("a board keeps to a few plain controls", async ({ page, errors }) => {
  await open(page, "/board?station=PAD&to=OXF&time=09:00");
  const nav = page.locator(".board__nav");
  await expect(nav.getByRole("link", { name: "Change" })).toHaveCount(0); // the top bar's Search does that
  await expect(page.getByRole("button", { name: "Save this journey" })).toBeVisible(); // a star on the nameboard
  expect((await page.getByRole("button", { name: "Save this journey" }).innerText()).trim()).toBe("");
  await expect(page.getByRole("link", { name: "Refresh" })).toBeVisible();
  await expect(page.locator(".board__foot")).not.toContainText("outlined platform");
  void errors;
});

test("saving a journey from the star still works, and says so", async ({ page, errors }) => {
  await open(page, "/board?station=PAD&to=OXF&time=09:00");
  await page.getByRole("button", { name: "Save this journey" }).click();
  await expect(page.locator("[data-save-note]")).toContainText(/Saved/i);
  await open(page, "/journeys");
  await expect(page.locator(".journeys__item")).toHaveCount(1);
  void errors;
});

test("demo mode doesn't print an allowance of a billion", async ({ page, errors }) => {
  await open(page, "/about");
  await expect(page.locator("main")).not.toContainText("1000000000");
  void errors;
});

test("a board's summary line opens the search filled in, to change it", async ({ page, errors }) => {
  await open(page, "/board?station=PAD&to=OXF&time=09:00&day=2026-11-09&mode=arr");
  await page.getByRole("link", { name: "Change this search" }).click();
  await expect(page.locator("#station")).toHaveValue("PAD");
  await expect(page.locator("#to")).toHaveValue("OXF");
  await expect(page.locator("#time")).toHaveValue("09:00");
  await expect(page.locator("#day")).toHaveValue("2026-11-09");
  await expect(page.locator('input[name="mode"][value="arr"]')).toBeChecked();
  void errors;
});

test("Back from a board returns to the search as it was filled in", async ({ page, errors }) => {
  await open(page, "/");
  await page.locator("#station").fill("PAD");
  await page.locator("#to").fill("OXF");
  await page.locator("#to").press("Escape"); // close the suggestions over the fold
  const fold = page.locator(".search__when summary"); // folded on a smaller screen; out already on a tall one
  if (await fold.isVisible()) await fold.click();
  await page.locator("#time").fill("09:00");
  await page.locator("button[type=submit]").click();
  await expect(page.locator(".board__sub")).toContainText("Calling at Oxford");
  await page.goBack();
  await expect(page.locator("#station")).toHaveValue("PAD");
  await expect(page.locator("#to")).toHaveValue("OXF");
  await expect(page.locator("#time")).toHaveValue("09:00");
  void errors;
});
