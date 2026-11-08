// Settings: save or forget the key, choose the train marker, check for updates.
import { canSelfUpdate, native } from "../../platform";
import type { Html } from "../html";
import type { RouteName } from "../routes";
import { settingsView } from "../views/settings";
import { Page } from "./page";

export class SettingsPage extends Page {
  readonly tab: RouteName = "settings";
  title = "Settings";

  async load(stale: () => boolean): Promise<Html | null> {
    const { rail, flash, updates, appearance } = this.ctx;
    const tier = await rail.tier();
    const info = await rail.tokenInfo();
    if (stale()) return null;
    // The app shows the flash itself once the page is drawn (and then clears it); here it only opens the key section
    return settingsView({ demo: rail.demo, tier, info, hint: rail.tokenHint, tokenError: rail.lastTokenError,
      budget: rail.budget.state(), error: flash.error, update: updates.info, native,
      selfUpdate: canSelfUpdate, marker: appearance.marker() });
  }

  mount(root: HTMLElement): void {
    const { rail, flash, updates, appearance } = this.ctx;
    const form = root.querySelector<HTMLFormElement>("[data-key-form]")!;
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const btn = form.querySelector("button")!;
      btn.disabled = true;
      btn.textContent = "Checking with Realtime Trains…";
      try {
        await rail.setKey(String(new FormData(form).get("token") ?? ""));
        flash.message = "Key saved and working.";
      } catch (e) {
        flash.error = e instanceof Error ? e.message : String(e);
      }
      this.ctx.rerender();
    });
    root.querySelector("[data-forget-key]")?.addEventListener("click", async () => {
      await rail.removeKey();
      flash.message = "Key removed from this device. Showing demo trains.";
      this.ctx.rerender();
    });
    root.querySelector("[data-check-update]")!.addEventListener("click", () => void updates.check(true));
    root.querySelectorAll<HTMLInputElement>("[data-marker-choice]").forEach((input) =>
      input.addEventListener("change", () => appearance.setMarker(input.value)));
  }
}
