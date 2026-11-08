// Settings: save or forget the key, choose the train marker, check for updates.
import { canSelfUpdate, native } from "../../platform";
import { fragment, type Html } from "../html";
import type { RouteName } from "../routes";
import { settingsView, tokenErrorView } from "../views/settings";
import { Page } from "./page";

export class SettingsPage extends Page {
  readonly tab: RouteName = "settings";
  title = "Settings";

  async load(stale: () => boolean): Promise<Html | null> {
    const { rail, flash, updates, appearance } = this.ctx;
    const tier = await rail.tier();
    const info = await rail.tokenInfo();
    if (stale()) return null;
    const view = settingsView({ demo: rail.demo, tier, info, hint: rail.tokenHint, tokenError: rail.lastTokenError,
      budget: rail.budget.state(), message: flash.message, update: updates.info, native,
      selfUpdate: canSelfUpdate, marker: appearance.marker() });
    flash.message = null; // shown once
    return view;
  }

  mount(root: HTMLElement): void {
    const { rail, flash, updates, appearance } = this.ctx;
    const form = root.querySelector<HTMLFormElement>("[data-key-form]")!;
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const btn = form.querySelector("button")!;
      const label = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Checking with Realtime Trains…";
      try {
        await rail.setKey(String(new FormData(form).get("token") ?? ""));
      } catch (e) {
        // Stay on the form with what was typed, so a typo can be fixed in place.
        btn.disabled = false;
        btn.textContent = label;
        showTokenError(form, e instanceof Error ? e.message : String(e));
        return;
      }
      flash.message = "Key saved and working.";
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

/** The key's problem, said under its field and tied to it, with the field focused to try again. */
function showTokenError(form: HTMLFormElement, message: string): void {
  const input = form.querySelector<HTMLInputElement>("#token")!;
  form.querySelector("#token-error")?.remove();
  input.closest(".field")!.append(fragment(tokenErrorView(message)));
  input.setAttribute("aria-describedby", "token-error");
  input.focus();
}
