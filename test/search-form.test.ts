// The station boxes follow the ARIA combobox pattern, so a screen reader knows a list of stations can open, what the
// list is called, and hears how many stations match as you type (the counting itself: test/ui/flows.spec.ts).
import { describe, expect, it } from "vitest";
import { searchForm } from "../src/ui/components/search-form";

const form = searchForm().value;
const tag = (re: RegExp) => form.match(re)?.[0] ?? "";

describe.each(["station", "to"])("the %s box", (id) => {
  it("is a combobox that controls its list", () => {
    const input = tag(new RegExp(`<input id="${id}"[^>]*>`));
    expect(input).toContain('role="combobox"');
    expect(input).toContain(`aria-controls="${id}-list"`);
    expect(input).toContain('aria-expanded="false"');
  });

  it("has a list named by the box's label", () => {
    const label = tag(new RegExp(`<label for="${id}"[^>]*>`));
    const labelId = label.match(/ id="([^"]+)"/)?.[1];
    expect(labelId).toBeTruthy();
    expect(tag(new RegExp(`<ul[^>]*id="${id}-list"[^>]*>`))).toContain(`aria-labelledby="${labelId}"`);
  });

  it("has one status line of its own, for the number of matches", () => {
    expect(form.match(new RegExp(`data-suggest-status="${id}"`, "g"))).toHaveLength(1);
    expect(tag(new RegExp(`<[^>]*data-suggest-status="${id}"[^>]*>`))).toContain('role="status"');
  });
});

describe("Another time or day", () => {
  it("is open, with a space before the open attribute, when a time is set", () => {
    const details = searchForm({ time: "09:00" }).value.match(/<details[^>]*>/)?.[0];
    expect(details).toBe('<details class="search__when disclosure" open>');
  });

  it("is folded away with no time or day", () => {
    expect(tag(/<details[^>]*>/)).toBe('<details class="search__when disclosure">');
  });
});
