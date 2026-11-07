// The app shell: hash routes (they work from a file or the APK), page wiring, and the update check.
import { stopSummary } from "../core/engine";
import { BusyError, OfflineError, type Rail, RttError } from "../core/rail";
import { fromLondon, isoDate, londonParts, type Ms } from "../core/time";
import { isNewer, readRelease, RELEASES_API } from "../core/update";
import { APP_VERSION, canSelfUpdate, getJson, installUpdate, native } from "../platform";
import { type Html, html, qs } from "./html";
import { LiveTrain } from "./live";
import { prefs } from "./prefs";
import { aboutView, boardView, chrome, home, problem, type Query, settingsView, trainView, type UpdateInfo } from "./views";

interface Route {
  name: string;
  path: string;
  params: URLSearchParams;
}

function parseHash(): Route {
  const h = location.hash.replace(/^#/, "") || "/";
  const [path, query = ""] = h.split("?");
  const params = new URLSearchParams(query);
  const name = path === "/" ? "home" : path.startsWith("/train/") ? "train" : path.slice(1);
  return { name, path, params };
}

const q = (p: URLSearchParams): Query => ({
  station: p.get("station") ?? "", to: p.get("to") ?? "", time: p.get("time") ?? "", day: p.get("day") ?? "",
  mode: p.get("mode") ?? "dep", all: p.get("all") ?? "",
});

/** "17:45" and a day (or today) to an instant. "00:30" typed late at night means tonight, not last night. */
export function when(time: string, day: string, now: Ms): Ms | null {
  const t = time.trim();
  const d = day.trim();
  if (!t && !d) return null;
  const date = d || isoDate(now);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new RangeError("bad day");
  const [y, mo, dd] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (!t) {
    const p = londonParts(now);
    return fromLondon(y, mo, dd, p.h, p.mi);
  }
  const tm = /^(\d{1,2})[:.](\d{2})$/.exec(t);
  if (!tm || Number(tm[1]) > 23 || Number(tm[2]) > 59) throw new RangeError("bad time");
  let at = fromLondon(y, mo, dd, Number(tm[1]), Number(tm[2]));
  if (!d && at < now - 6 * 3_600_000) at += 86_400_000;
  return at;
}

const BOARD_EVERY = 120_000; // a live board's own refresh
const BOARD_AUTO_FOR = 15 * 60_000; // then it waits for Refresh

export class App {
  private live: LiveTrain | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private boardTimer: ReturnType<typeof setInterval> | null = null;
  private update: UpdateInfo = { state: "idle", current: APP_VERSION };
  private settingsMsg: { message?: string | null; error?: string | null } = {};
  private seq = 0;

  constructor(private root: HTMLElement, private rail: Rail) {}

  async start(): Promise<void> {
    await this.rail.start();
    window.addEventListener("hashchange", () => void this.render());
    await this.render();
    void this.autoCheckUpdate();
  }

  private cleanup() {
    this.live?.stop();
    this.live = null;
    if (this.retry) clearTimeout(this.retry);
    if (this.boardTimer) clearInterval(this.boardTimer);
    this.retry = null;
    this.boardTimer = null;
  }

  private paint(route: string, main: Html, title: string) {
    const u = this.update;
    const oneTap = canSelfUpdate && !!u.apk && route !== "settings";
    const banner = u.state === "available" && route !== "settings"
      ? html`<p class="banner" role="note">Version ${u.latest} of LiveLine is available. ${oneTap
        ? html`<button type="button" class="linkish" data-banner-update ${u.progress ? html`disabled` : ""}>${u.progress ?? "Update now"}</button>`
        : html`<a href="#/settings">Update</a>`}</p>` : null;
    this.root.innerHTML = chrome(route, this.rail.demo, this.rail.budget.state(), main, banner).value;
    this.root.querySelector("[data-banner-update]")?.addEventListener("click", () => void this.installNow());
    document.title = title ? `${title} · LiveLine` : "LiveLine";
  }

  async render(): Promise<void> {
    this.cleanup();
    const mine = ++this.seq; // a newer navigation wins over a slow answer
    const r = parseHash();
    const stale = () => mine !== this.seq;
    try {
      if (r.name === "home") return this.home(r);
      if (r.name === "board") return await this.board(r, stale);
      if (r.name === "train") return await this.train(r, stale);
      if (r.name === "settings") return await this.settings(stale);
      if (r.name === "about") return await this.about(stale);
      this.paint("", problem("Not found", "There's no page here.", false), "Not found");
    } catch (e) {
      if (stale()) return;
      if (e instanceof RttError) {
        const busy = e instanceof BusyError;
        this.paint("", problem(e instanceof OfflineError ? "No connection" : busy ? "Realtime Trains is busy" : "Couldn't show that", e.message, busy, r.name === "board" ? q(r.params) : null), "Problem");
        this.wireCommon();
        if (busy) this.retry = setTimeout(() => void this.render(), 30_000);
      } else {
        throw e;
      }
    }
  }

  // ---- pages ----
  private home(r: Route) {
    this.paint("home", home(q(r.params)), "");
    this.wireCommon();
  }

  private async board(r: Route, stale: () => boolean) {
    const query = q(r.params);
    if (!query.station?.trim()) {
      location.hash = "#/";
      return;
    }
    let at: Ms | null;
    try {
      at = when(query.time ?? "", query.day ?? "", this.rail.clock());
    } catch {
      this.paint("", problem("Find trains", "That time isn't valid. Use 24-hour time like 17:45.", false, query), "Find trains");
      this.wireCommon();
      return;
    }
    const force = r.params.get("refresh") === "1";
    const res = await this.rail.board({ station: query.station!, when: at, to: query.to || null, mode: query.mode === "arr" ? "arr" : "dep",
      showAll: !!query.all, force });
    if (stale()) return;
    const base = { station: query.station, to: query.to, mode: query.mode, all: query.all };
    const t0 = res.board.timeFrom;
    const at2 = (t: Ms) => ({ time: `${String(londonParts(t).h).padStart(2, "0")}:${String(londonParts(t).mi).padStart(2, "0")}`, day: isoDate(t) });
    const nav = {
      earlier: `#/board${qs({ ...base, ...at2(t0 - 3_600_000) })}`,
      later: `#/board${qs({ ...base, ...at2(t0 + 3_600_000) })}`,
      refresh: `#/board${qs({ ...base, time: query.time, day: query.day, refresh: 1 })}`,
      switch: `#/board${qs({ ...base, mode: query.mode === "arr" ? "dep" : "arr", time: query.time, day: query.day })}`,
      all: `#/board${qs({ ...base, all: query.all ? "" : 1, time: query.time, day: query.day })}`,
    };
    const live = !query.time;
    this.paint("", boardView(res, query, nav, live, this.rail.clock()), res.board.stationName);
    this.wireCommon();
    if (force) history.replaceState(null, "", nav.refresh.replace(/&refresh=1|refresh=1&?/, "")); // don't refetch on back
    if (live) {
      // A "now" board updates in place, without jumping to the top: every 2 minutes while it's on screen, as a background
      // call (it never spends the calls kept for searches), and only for the first 15 minutes. A board left open on the
      // table would otherwise cost 30 calls an hour. After that, Refresh (or coming back to it) updates it.
      const opened = Date.now();
      this.boardTimer = setInterval(async () => {
        if (document.visibilityState !== "visible" || stale()) return;
        if (Date.now() - opened > BOARD_AUTO_FOR) {
          if (this.boardTimer) clearInterval(this.boardTimer);
          this.boardTimer = null;
          const foot = this.root.querySelector(".board__foot");
          if (foot) foot.insertAdjacentHTML("beforeend", " Stopped updating by itself to save calls: tap Refresh.");
          return;
        }
        try {
          const fresh = await this.rail.board({ station: query.station!, to: query.to || null, mode: query.mode === "arr" ? "arr" : "dep",
            showAll: !!query.all, background: true });
          if (stale()) return;
          const tpl = document.createElement("template");
          tpl.innerHTML = boardView(fresh, query, nav, live, this.rail.clock()).value;
          for (const sel of [".trains", ".board__foot", ".empty"]) {
            const now = this.root.querySelector(sel);
            const next = tpl.content.querySelector(sel);
            if (now && next) now.replaceWith(next);
          }
        } catch {
          /* keep what's shown; the next round tries again */
        }
      }, BOARD_EVERY);
    }
  }

  private async train(r: Route, stale: () => boolean) {
    const uid = decodeURIComponent(r.path.slice("/train/".length));
    const at = (r.params.get("at") ?? "").toUpperCase();
    const to = (r.params.get("to") ?? "").toUpperCase();
    const res = await this.rail.service(uid, { at, to });
    if (stale()) return;
    const tl = res.timeline;
    this.paint("", trainView(res, uid, at, to, stopSummary(tl, at), stopSummary(tl, to, false)), "Train");
    this.wireCommon();
    const page = this.root.querySelector<HTMLElement>("[data-train]")!;
    document.title = `${page.dataset.title} · LiveLine`;
    prefs.set("liveline.tracking", { href: location.hash, title: page.dataset.title, ends: Number(page.dataset.ends) || 0, seen: Date.now() });
    this.live = new LiveTrain(page, this.rail, uid, at, to);
    this.live.start();
  }

  private async settings(stale: () => boolean) {
    const tier = await this.rail.tier();
    const info = await this.rail.tokenInfo();
    if (stale()) return;
    this.paint("settings", settingsView({ demo: this.rail.demo, tier, info, hint: this.rail.tokenHint, tokenError: this.rail.lastTokenError,
      budget: this.rail.budget.state(), ...this.settingsMsg, update: this.update, native, selfUpdate: canSelfUpdate }), "Settings");
    this.settingsMsg = {};
    this.wireCommon();
    const form = this.root.querySelector<HTMLFormElement>("[data-key-form]")!;
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const btn = form.querySelector("button")!;
      btn.disabled = true;
      btn.textContent = "Checking with Realtime Trains…";
      try {
        await this.rail.setKey(String(new FormData(form).get("token") ?? ""));
        this.settingsMsg = { message: "Key saved and working." };
      } catch (e) {
        this.settingsMsg = { error: e instanceof Error ? e.message : String(e) };
      }
      void this.render();
    });
    this.root.querySelector("[data-forget-key]")?.addEventListener("click", async () => {
      await this.rail.removeKey();
      this.settingsMsg = { message: "Key removed from this device. Showing demo trains." };
      void this.render();
    });
    this.root.querySelector("[data-check-update]")!.addEventListener("click", () => void this.checkUpdate(true));
    this.root.querySelector("[data-install-update]")?.addEventListener("click", () => void this.installNow());
  }

  private async about(stale: () => boolean) {
    const info = await this.rail.tokenInfo();
    if (stale()) return;
    this.paint("about", aboutView(this.rail.demo, info, this.rail.lastTokenError, this.rail.budget.state(), APP_VERSION), "About");
    this.wireCommon();
  }

  // ---- updates ----
  async checkUpdate(show: boolean): Promise<void> {
    this.update = { state: "checking", current: APP_VERSION };
    if (show) void this.render();
    try {
      const r = await getJson(RELEASES_API);
      if (r.status === 404) this.update = { state: "current", current: APP_VERSION, message: "No release has been published yet." };
      else if (r.status !== 200) throw new Error(`GitHub answered ${r.status}`);
      else {
        const rel = readRelease(r.body);
        if (!rel) throw new Error("GitHub's answer didn't make sense");
        this.update = isNewer(rel.version, APP_VERSION)
          ? { state: "available", current: APP_VERSION, latest: rel.version, url: rel.apkUrl ?? rel.pageUrl, page: rel.pageUrl, notes: rel.notes,
              apk: rel.apkUrl, sha256: rel.sha256, sha256Url: rel.sha256Url }
          : { state: "current", current: APP_VERSION, latest: rel.version };
      }
    } catch (e) {
      this.update = { state: "error", current: APP_VERSION, message: `Couldn't check for updates (${e instanceof Error ? e.message : "offline"}).` };
    }
    this.update.checkedAt = Date.now();
    prefs.set("liveline.update", this.update);
    if (show || this.update.state === "available") void this.render();
  }

  /** One tap: download, check, install over this version. Key and journeys are app data, so they stay. */
  private async installNow(): Promise<void> {
    const u = this.update;
    if (u.state !== "available" || !u.apk || u.progress) return;
    const show = (text: string) => {
      this.update = { ...this.update, progress: text };
      const el = this.root.querySelector("[data-update-progress], [data-banner-update]");
      if (el) el.textContent = text;
      this.root.querySelectorAll<HTMLButtonElement>("[data-install-update], [data-banner-update]").forEach((b) => (b.disabled = true));
    };
    show("Starting…");
    try {
      await installUpdate({ url: u.apk, sha256: u.sha256 ?? null, sha256Url: u.sha256Url ?? null }, (p) => {
        if (p.stage === "permission") show("Allow LiveLine to install updates (Android asks once), then come back.");
        else if (p.stage === "downloading") show(p.fraction != null && p.fraction >= 0 ? `Downloading… ${Math.round(p.fraction * 100)}%` : "Downloading…");
        else if (p.stage === "installing") show("Installing…");
        else show("Confirm the update in Android's dialog.");
      });
      show("Updated. LiveLine restarts with the new version.");
    } catch (e) {
      this.update = { ...this.update, progress: undefined, message: e instanceof Error ? e.message : String(e) };
      void this.render();
      return;
    }
  }

  /** Once a day, quietly. If there's a new version, a banner says so on every page. */
  private async autoCheckUpdate(): Promise<void> {
    const last = prefs.get<UpdateInfo | null>("liveline.update", null);
    if (last && last.checkedAt && Date.now() - last.checkedAt < 86_400_000) {
      if (last.state === "available" && last.latest && isNewer(last.latest, APP_VERSION)) {
        this.update = { ...last, current: APP_VERSION };
        void this.render();
      }
      return;
    }
    await this.checkUpdate(false);
  }

  // ---- shared wiring ----
  private wireCommon() {
    this.root.querySelectorAll<HTMLElement>("[data-suggest]").forEach((box) => this.suggest(box));
    const form = this.root.querySelector<HTMLFormElement>("[data-search]");
    form?.addEventListener("submit", (ev) => {
      ev.preventDefault();
      const f = new FormData(form);
      const get = (k: string) => String(f.get(k) ?? "");
      location.hash = `#/board${qs({ station: get("station"), to: get("to"), time: get("time"), day: get("day"), mode: get("mode") === "arr" ? "arr" : "" })}`;
    });
    this.recent();
    this.journeys();
    this.tracking();
  }

  private suggest(box: HTMLElement) {
    const input = box.querySelector("input")!;
    const list = box.querySelector<HTMLElement>(".suggest__list")!;
    let items: Array<{ name: string; crs: string }> = [];
    let active = -1;
    const close = () => {
      list.hidden = true;
      input.setAttribute("aria-expanded", "false");
      active = -1;
    };
    const choose = (s: { name: string; crs: string }) => {
      input.value = `${s.name} (${s.crs})`;
      close();
    };
    const draw = () => {
      list.replaceChildren(...items.map((s, i) => {
        const li = document.createElement("li");
        li.id = `${list.id}-${i}`;
        li.setAttribute("role", "option");
        li.setAttribute("aria-selected", String(i === active));
        const name = document.createElement("span");
        name.textContent = s.name;
        const crs = document.createElement("span");
        crs.className = "suggest__crs";
        crs.textContent = s.crs;
        li.append(name, crs);
        li.addEventListener("mousedown", (e) => {
          e.preventDefault();
          choose(s);
        });
        return li;
      }));
      list.hidden = items.length === 0;
      input.setAttribute("aria-expanded", String(items.length > 0));
      if (active >= 0) input.setAttribute("aria-activedescendant", `${list.id}-${active}`);
      else input.removeAttribute("aria-activedescendant");
    };
    input.addEventListener("input", () => {
      const text = input.value.trim();
      items = text.length < 2 ? [] : this.rail.stations.search(text).map((s) => ({ name: s.name, crs: s.crs }));
      active = -1;
      draw();
    });
    input.addEventListener("keydown", (e) => {
      if (list.hidden) return;
      if (e.key === "ArrowDown") {
        active = Math.min(active + 1, items.length - 1);
        draw();
        e.preventDefault();
      } else if (e.key === "ArrowUp") {
        active = Math.max(active - 1, 0);
        draw();
        e.preventDefault();
      } else if (e.key === "Enter" && active >= 0) {
        choose(items[active]);
        e.preventDefault();
      } else if (e.key === "Escape") close();
    });
    input.addEventListener("blur", () => setTimeout(close, 100));
  }

  private recent() {
    const board = this.root.querySelector<HTMLElement>("[data-board]");
    let list = prefs.get<Array<{ name: string; crs: string }>>("liveline.recent", []);
    if (board?.dataset.crs) {
      const entry = { name: board.dataset.station!, crs: board.dataset.crs };
      list = [entry, ...list.filter((s) => s.crs !== entry.crs)].slice(0, 6);
      prefs.set("liveline.recent", list);
    }
    const box = this.root.querySelector<HTMLElement>("[data-recent]");
    if (!box || !list.length) return;
    box.querySelector("ul")!.innerHTML = list.map((s) => html`<li><a href="#/board${qs({ station: s.crs })}">${s.name}</a></li>`.value).join("");
    box.hidden = false;
  }

  private journeys() {
    type J = { from: string; fromName: string; to: string; toName: string };
    let list = prefs.get<J[]>("liveline.journeys", []);
    const board = this.root.querySelector<HTMLElement>("[data-board]");
    const save = this.root.querySelector<HTMLButtonElement>("[data-save-journey]");
    if (board && save) {
      const j: J = { from: board.dataset.crs!, fromName: board.dataset.station!, to: board.dataset.toCrs!, toName: board.dataset.toName! };
      const note = this.root.querySelector("[data-save-note]")!;
      const has = () => list.some((x) => x.from === j.from && x.to === j.to);
      if (has()) save.textContent = "Saved. Remove this journey";
      save.addEventListener("click", () => {
        if (has()) {
          list = list.filter((x) => !(x.from === j.from && x.to === j.to));
          save.textContent = "Save this journey";
          note.textContent = "Removed.";
        } else {
          list = [j, ...list].slice(0, 8);
          save.textContent = "Saved. Remove this journey";
          note.textContent = "It's on the home screen now.";
        }
        prefs.set("liveline.journeys", list);
      });
    }
    const box = this.root.querySelector<HTMLElement>("[data-journeys]");
    if (!box || !list.length) return;
    box.querySelector("ul")!.innerHTML = list.map((j) => html`
      <li class="journeys__item">
        <a class="journeys__go" href="#/board${qs({ station: j.from, to: j.to })}">${j.fromName} → ${j.toName}</a>
        <a class="journeys__back" href="#/board${qs({ station: j.to, to: j.from })}" aria-label="Return: ${j.toName} to ${j.fromName}">Return</a>
      </li>`.value).join("");
    box.hidden = false;
  }

  private tracking() {
    const box = this.root.querySelector<HTMLElement>("[data-tracking]");
    const t = prefs.get<{ href: string; title: string; ends: number; seen: number } | null>("liveline.tracking", null);
    if (!box || !t) return;
    // offered until half an hour after the train is due to finish (or 3 hours after it was opened)
    const until = t.ends ? t.ends + 30 * 60_000 : t.seen + 3 * 3_600_000;
    if (Date.now() > until || !t.href.startsWith("#/train/")) return;
    box.querySelector("a")!.setAttribute("href", t.href);
    box.querySelector(".tracking__title")!.textContent = t.title;
    box.querySelector(".tracking__sub")!.textContent = "Tap to see where it is now";
    box.hidden = false;
  }
}
