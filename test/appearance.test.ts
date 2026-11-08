// @vitest-environment happy-dom
// Settings > Appearance: the theme and the train marker, each kept on the device and set on <html> for the CSS.
import { beforeEach, describe, expect, it } from "vitest";
import { Appearance, THEMES } from "../src/ui/store/appearance";
import { KEYS } from "../src/ui/store/keys";

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe("the theme", () => {
  it("is Operator colour until you choose another", () => {
    const a = new Appearance();
    expect(a.theme()).toBe("operator");
    a.apply();
    expect(document.documentElement.dataset.theme).toBe("operator");
  });

  it("offers the three themes, the default first", () => {
    expect(THEMES.map(([id]) => id)).toEqual(["operator", "swiss", "quiet"]);
  });

  it("a choice shows at once and is kept", () => {
    new Appearance().setTheme("quiet");
    expect(document.documentElement.dataset.theme).toBe("quiet");
    expect(new Appearance().theme()).toBe("quiet"); // after a restart
  });

  it("ignores a theme it doesn't know, chosen or stored (an old or tampered value)", () => {
    const a = new Appearance();
    a.setTheme("swiss");
    a.setTheme("neon");
    expect(a.theme()).toBe("swiss");
    localStorage.setItem(KEYS.theme, JSON.stringify("platform"));
    expect(new Appearance().theme()).toBe("operator");
  });
});
