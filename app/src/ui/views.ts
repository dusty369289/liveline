// Every screen, as markup. Same structure and classes as the Python app's Jinja templates, so the CSS carries over.
import { changed, type Shown, type StopSummary, type Timeline } from "../core/engine";
import {
  booked,
  destinationName,
  forPassengers,
  isBus,
  isCancelled,

  originName,
  rowCancelled,
  statusMessage,
} from "../core/models";
import type { BoardResult, ServiceResult, Tier } from "../core/rail";
import { precision, TIERS } from "../core/rail";
import type { BudgetState } from "../core/budget";
import type { TokenInfo } from "../core/rtt";
import { hm, isoDate, type Ms } from "../core/time";
import { type Html, html, qs } from "./html";

export interface Query {
  station?: string;
  to?: string;
  time?: string;
  day?: string;
  mode?: string;
  all?: string;
}

export function ago(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s} s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  return `${Math.floor(s / 3600)} h ago`;
}

export function delayClass(s: Shown | null): string {
  if (!s || s.delayMin == null) return "";
  if (s.delayMin >= 5) return "is-very-late";
  if (s.delayMin >= 2) return "is-late";
  if (s.delayMin <= -1) return "is-early";
  return "is-ontime";
}

const hmh = (t: Ms | null) => hm(t, true);
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function dayLabel(t: Ms): string {
  const [y, m, d] = isoDate(t).split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${DAYS[dow]} ${d} ${MONTHS[m - 1]}`;
}

// ---- chrome ----
export function chrome(route: string, demo: boolean, budget: BudgetState, main: Html, update: Html | null = null): Html {
  const cur = (r: string) => (route === r ? "page" : null);
  return html`
  <a class="skip-link" href="#main">Skip to content</a>
  <header class="topbar">
    <a class="topbar__logo" href="#/">LiveLine</a>
    <nav class="topbar__nav" aria-label="Main">
      <a href="#/" aria-current="${cur("home")}">Search</a>
      <a href="#/settings" aria-current="${cur("settings")}">Settings</a>
      <a href="#/about" aria-current="${cur("about")}">About</a>
    </nav>
  </header>
  ${demo ? html`<p class="banner banner--demo" role="note"><strong>Demo data.</strong> These trains are simulated. Add your Realtime Trains key in <a href="#/settings">Settings</a> to see real ones.</p>` : ""}
  ${!demo && budget.remaining.hour <= 15 ? html`<p class="banner" role="note">Only ${budget.remaining.hour} Realtime Trains calls left this hour, so pages update less often.</p>` : ""}
  ${update ?? ""}
  <main id="main" class="wrap">${main}</main>
  <footer class="footer wrap"><p>Data from <a href="https://www.realtimetrains.co.uk/" target="_blank" rel="noopener">Realtime Trains</a>${demo ? " (simulated)" : ""}. Not affiliated.</p></footer>`;
}

// ---- search ----
export function searchForm(q: Query = {}): Html {
  return html`
<form class="search stack" data-search role="search" autocomplete="off">
  <div class="field">
    <label for="station">Station</label>
    <div class="suggest" data-suggest>
      <input id="station" name="station" type="text" inputmode="search" required placeholder="e.g. Reading or RDG"
             value="${q.station ?? ""}" aria-autocomplete="list" aria-controls="station-list" aria-expanded="false" enterkeyhint="search">
      <ul class="suggest__list" id="station-list" role="listbox" hidden></ul>
    </div>
  </div>
  <div class="cluster search__row">
    <div class="field field--time">
      <label for="time">Time</label>
      <input id="time" name="time" type="time" value="${q.time ?? ""}" aria-describedby="time-hint">
    </div>
    <div class="field field--day">
      <label for="day">Day</label>
      <input id="day" name="day" type="date" value="${q.day ?? ""}">
    </div>
  </div>
  <p class="hint" id="time-hint">Leave time empty for trains leaving now.</p>
  <div class="field">
    <label for="to">Calling at <span class="hint">(optional; for arrivals, coming from)</span></label>
    <div class="suggest" data-suggest>
      <input id="to" name="to" type="text" inputmode="search" placeholder="Any station" value="${q.to ?? ""}"
             aria-autocomplete="list" aria-controls="to-list" aria-expanded="false">
      <ul class="suggest__list" id="to-list" role="listbox" hidden></ul>
    </div>
  </div>
  <fieldset class="cluster mode">
    <legend class="visually-hidden">Show</legend>
    <label><input type="radio" name="mode" value="dep" ${q.mode !== "arr" ? html`checked` : ""}> Departures</label>
    <label><input type="radio" name="mode" value="arr" ${q.mode === "arr" ? html`checked` : ""}> Arrivals</label>
  </fieldset>
  <button class="button" type="submit">Find trains</button>
</form>`;
}

export function home(q: Query = {}): Html {
  return html`
<div class="stack home">
  <section class="tracking" data-tracking hidden aria-labelledby="tracking-h">
    <h2 id="tracking-h" class="label">Carry on tracking</h2>
    <a class="tracking__link" href="#/"><span class="tracking__title"></span><span class="tracking__sub hint"></span></a>
  </section>
  <section class="journeys" data-journeys hidden aria-labelledby="journeys-h">
    <h2 id="journeys-h" class="label">My journeys</h2>
    <ul class="journeys__list"></ul>
  </section>
  <h1>Where are you catching a train?</h1>
  ${searchForm(q)}
  <p class="hint">Tip: put a station in “Calling at” and you can save the journey for one-tap use, both ways.</p>
  <section class="recent" data-recent hidden aria-labelledby="recent-h">
    <h2 id="recent-h" class="label">Recent stations</h2>
    <ul class="recent__list cluster"></ul>
  </section>
</div>`;
}

export function problem(title: string, message: string, busy: boolean, q: Query | null = null): Html {
  return html`
<div class="stack">
  <h1>${title}</h1>
  <p class="problem" role="alert">${message}</p>
  ${busy ? html`<p class="hint">This page tries again by itself in 30 seconds.</p>` : ""}
  ${q ? searchForm(q) : html`<p><a href="#/">Search again</a></p>`}
</div>`;
}

// ---- board ----
export function boardView(res: BoardResult, q: Query, nav: Record<string, string>, live: boolean, now: Ms): Html {
  const b = res.board;
  const arr = res.mode === "arr";
  const here = res.station?.crs ?? b.stationCrs ?? "";
  const rows = res.rows.map((r) => {
    const t = arr ? r.arrival : r.departure;
    const liveT = t.actual ?? t.forecast ?? t.estimate;
    const bk = booked(t);
    const mins = liveT != null && bk != null ? Math.floor((liveT - bk) / 60_000) : 0;
    const cancelled = rowCancelled(r);
    const liveCls = cancelled ? "is-cancelled" : mins >= 5 ? "is-very-late" : mins >= 2 ? "is-late" : "";
    const status = cancelled ? html`Cancelled`
      : t.actual != null ? html`${arr ? "Arr" : "Left"} ${hm(t.actual)}`
      : liveT != null && mins >= 1 ? html`Exp ${hm(liveT)}`
      : liveT != null ? html`On time` : html`<span class="muted">No report</span>`;
    const meta = [
      isBus(r) ? html`<strong>Bus</strong> · ` : "",
      !forPassengers(r) ? html`<strong>Not in service</strong> · ` : "",
      r.operatorName || "No operator",
      r.headcode && r.headcode !== "0B00" ? ` · ${r.headcode}` : "",
      r.branding ? ` · ${r.branding}` : "",
      r.vehicles ? ` · ${r.vehicles} coaches` : "",
      r.status === "APPROACHING" ? " · Approaching" : ["AT_PLATFORM", "DEPART_PREPARING", "DEPART_READY"].includes(r.status ?? "") ? " · At platform" : "",
    ];
    const href = `#/train/${encodeURIComponent(r.uniqueId)}${qs({ at: here, to: res.to?.crs })}`;
    const platCls = `${r.platformChanged ? " is-changed" : ""}${r.platform && !r.platformConfirmed ? " is-unconfirmed" : ""}`;
    return html`
    <li class="trains__row${cancelled ? " is-cancelled" : ""}">
      <a class="trains__link" href="${href}">
        <span class="trains__when"><span class="trains__time tnum">${hm(bk)}</span><span class="trains__live tnum ${liveCls}">${status}</span></span>
        <span class="trains__dest">
          <span class="trains__place">${arr ? r.origin : r.destination}</span>
          <span class="trains__meta">${meta}</span>
        </span>
        <span class="trains__plat tnum${platCls}" aria-label="${r.platform ? `Platform ${r.platform}${r.platformConfirmed ? "" : ", not confirmed"}` : null}">${r.platform ? html`<span class="trains__plat-label" aria-hidden="true">Plat</span>${r.platform}` : ""}</span>
      </a>
    </li>`;
  });
  const sm = statusMessage(b.status);
  const otherDay = isoDate(b.timeFrom) !== isoDate(now);
  return html`
<div class="stack board" data-board ${live ? html`data-live-board="60"` : ""}
     data-station="${res.station?.name ?? b.stationName}" data-crs="${here}"
     data-to-name="${res.to?.name ?? null}" data-to-crs="${res.to?.crs ?? null}">
  <header class="board__head">
    <h1>${b.stationName}</h1>
    <p class="board__sub">${arr ? "Arrivals" : "Departures"}${res.to ? ` ${arr ? "from" : "calling at"} ${res.to.name}` : ""}, ${hm(b.timeFrom)} to ${hm(b.timeTo)}${otherDay ? ` on ${dayLabel(b.timeFrom)}` : ""}</p>
    <p class="cluster board__nav">
      <a href="${nav.earlier}">Earlier</a>
      <a href="${nav.later}">Later</a>
      <a href="${nav.refresh}" data-board-refresh>Refresh</a>
      <a href="${nav.switch}">${arr ? "Departures" : "Arrivals"}</a>
      <a href="#/${qs({ station: q.station })}">Change</a>
    </p>
    ${res.to && res.station ? html`<p class="board__save"><button type="button" class="linkish" data-save-journey>Save this journey</button>
      <span class="hint" data-save-note role="status" aria-live="polite"></span></p>` : ""}
  </header>
  ${sm ? html`<p class="banner" role="note">${sm}</p>` : ""}
  ${res.fetched.stale ? html`<p class="hint">Showing the answer from ${ago((now - res.fetched.fetchedAt) / 1000)}. ${res.fetched.note}.</p>` : ""}
  ${res.rows.length === 0
    ? html`<p class="empty">No ${arr ? "arrivals" : "departures"} in this hour${res.to ? ` ${arr ? "from" : "calling at"} ${res.to.name}` : ""}. Try <a href="${nav.later}">later</a>.</p>`
    : html`<ol class="trains" aria-label="Trains">${rows}</ol>`}
  <p class="hint board__foot">Updated ${hm(res.fetched.fetchedAt)}${live ? ", refreshes every minute" : ""}. An outlined platform isn't confirmed yet.${
    res.hidden ? html` ${res.hidden} empty or staff-only train${res.hidden !== 1 ? "s" : ""} hidden: <a href="${nav.all}">show all</a>.`
      : res.showAll ? html` <a href="${nav.all}">Passenger trains only</a>.` : ""}</p>
</div>`;
}

// ---- train ----
function hero(stop: StopSummary | null, off: StopSummary | null): [Html | "", StopSummary | null] {
  const hs = stop && ["ahead", "here"].includes(stop.status) ? stop : off && off.status === "ahead" ? off : null;
  if (!hs) return ["", null];
  const isStop = hs === stop;
  let inner: Html | "" = "";
  if (hs.status === "here") inner = html`<span class="live__hero-num">Now</span><span class="live__hero-what">at ${hs.name}${hs.platform ? `, platform ${hs.platform}` : ""}</span>`;
  else if (hs.minutes != null && hs.minutes < 1) inner = html`<span class="live__hero-num">Due</span><span class="live__hero-what">at ${hs.name}${hs.platform && isStop ? `, platform ${hs.platform}` : ""}</span>`;
  else if (hs.minutes != null) {
    inner = html`<span class="live__hero-num">${hs.minutes}</span><span class="live__hero-unit">min</span>
      <span class="live__hero-what">until it ${isStop ? "leaves" : "reaches"} ${hs.name} · ${hm(hs.shown?.time ?? null)}${hs.platform && isStop ? ` · platform ${hs.platform}` : ""}</span>`;
  }
  return [html`<p class="live__hero">${inner}</p>`, hs];
}

function stopLine(sm: StopSummary, verb: "leaves" | "reaches"): Html {
  let body: Html;
  if (sm.status === "cancelled") body = html`<span class="problem">It no longer stops at ${sm.name}.</span>`;
  else if (sm.status === "here") body = html`<strong>It's at ${sm.name} now</strong>${sm.platform ? `, platform ${sm.platform}` : ""}.`;
  else if (sm.status === "gone") {
    body = html`It has ${verb === "leaves" ? "left" : "reached"} ${sm.name}${sm.shown && sm.shown.source === "actual" ? ` (${hm(sm.shown.time)})` : ""}.`;
  } else {
    body = html`It ${verb} <strong>${sm.name}</strong> at <strong class="tnum ${delayClass(sm.shown)}">${sm.shown ? hm(sm.shown.time) : "?"}</strong>${
      sm.minutes != null ? `, in ${sm.minutes} min` : ""}${sm.callsBetween ? `, ${sm.callsBetween} stop${sm.callsBetween !== 1 ? "s" : ""} away` : ""}${
      sm.platform && verb === "leaves" ? `, platform ${sm.platform}${sm.platformConfirmed ? "" : " (not confirmed)"}` : ""}.`;
  }
  return html`<p class="live__stop">${body}</p>`;
}

export function liveRegion(res: ServiceResult, at: string, to: string, stop: StopSummary | null, off: StopSummary | null): Html {
  const tl: Timeline = res.timeline;
  const p = tl.position;
  const s = tl.service;
  const [heroHtml, hs] = hero(stop, off);
  const lines = ([[stop, "leaves"], [off, "reaches"]] as const).filter(([sm]) => sm && sm !== hs).map(([sm, v]) => stopLine(sm!, v));
  const points = tl.points.map((v) => {
    const pt = v.point;
    const main = pt.kind === "pass" ? v.passing : (v.departure ?? v.arrival);
    const isAt = !!at && (pt.crs === at || pt.tiploc === at);
    const isTo = !!to && (pt.crs === to || pt.tiploc === to);
    const tin = v.passing ?? v.arrival ?? v.departure;
    const tout = v.passing ?? v.departure ?? v.arrival;
    const cls = [pt.kind === "pass" ? "is-pass" : "is-call", v.reported ? "is-reported" : "", isCancelled(pt) ? "is-cancelled" : "",
      isAt ? "is-at" : "", isTo ? "is-to" : "", !pt.public && pt.kind === "call" ? "is-operational" : ""].filter(Boolean).join(" ");
    let meta: unknown;
    if (isCancelled(pt)) meta = html`<span class="problem">${pt.display === "DIVERTED" ? "Diverted away" : "Cancelled here"}</span>`;
    else {
      const longDwell = pt.kind === "call" && v.arrival && v.departure && v.arrival.booked != null && v.departure.booked != null &&
        v.departure.booked - v.arrival.booked >= 120_000;
      meta = [
        pt.kind === "call" && pt.platform ? html`Plat ${pt.platform}${pt.platformChanged ? html` <span class="is-changed">changed</span>` : ""}` : "",
        longDwell ? ` · arr ${hm(v.arrival!.time)}` : "",
        pt.requestStop ? " · Request stop" : "",
        !pt.public && pt.kind === "call" ? " · Not for passengers" : "",
        pt.status === "APPROACHING" ? " · Approaching" : pt.status === "AT_PLATFORM" ? " · At platform" : pt.status === "DEPART_READY" ? " · Ready to leave" : pt.status === "DEPARTING" ? " · Leaving" : "",
      ];
    }
    let times: Html;
    if (main) {
      const src = main.source === "actual" ? "actual" : main.source === "est" ? "est" : main.source === "booked" ? "booked" : "forecast";
      let shownTime: Html | "" = "";
      if (!isCancelled(pt) && main.source !== "booked" && !(main.source === "est" && !changed(main))) {
        shownTime = html`${main.source === "est" ? hm(main.time) : hmh(main.time)}${main.source === "est" ? html`<span class="est">est</span>` : ""}${
          main.delayMin ? html`<span class="route__delay">${main.delayMin > 0 ? "+" : "−"}${Math.abs(main.delayMin)}</span>` : ""}`;
      }
      times = html`<span class="route__booked tnum">${pt.kind === "pass" ? hmh(main.booked) : hm(main.booked)}</span><span class="route__live tnum ${delayClass(main)} src-${src}">${shownTime}</span>`;
    } else times = html`<span class="route__booked"></span><span class="route__live"></span>`;
    return html`
    <li class="route__pt ${cls}" data-index="${v.index}" id="${isAt ? "your-stop" : null}" data-t-in="${tin?.time ?? ""}" data-t-out="${tout?.time ?? ""}">
      <span class="route__mark" aria-hidden="true"></span>
      <span class="route__name"><span class="route__place">${pt.name}</span><span class="route__meta">${meta}</span></span>
      ${times}
    </li>`;
  });
  return html`
<section class="live" aria-labelledby="live-h" data-state="${p.state}" data-from="${p.fromIndex ?? ""}" data-to="${p.toIndex ?? ""}"
  data-since="${p.since ?? ""}" data-expected="${p.expected ?? ""}" data-fraction="${p.fraction.toFixed(3)}" data-hold="0.95"
  data-refresh="${Math.floor(res.refreshAfter)}" data-fetched="${res.fetched.fetchedAt}">
  <div class="live__status" role="status">
    <h2 id="live-h" class="visually-hidden">Where the train is</h2>
    ${heroHtml}
    <p class="live__headline state-${p.state}">${p.headline}</p>
    ${lines}
    ${tl.worst ? html`<p class="live__stop hint">Lost most time between ${tl.worst.fromName} and ${tl.worst.toName} (${tl.worst.minutes} min).</p>` : ""}
    <p class="live__age hint"><span data-age>Updated ${ago((tl.now - res.fetched.fetchedAt) / 1000)}</span>${res.fetched.stale ? ` (${res.fetched.note})` : ""}</p>
  </div>
  ${s.reasons.length ? html`<ul class="reasons">${s.reasons.map((r) => html`<li>${r.kind === "CANCEL" ? "Cancelled" : "Delayed"} because of ${r.text.slice(0, 1).toLowerCase() + r.text.slice(1)}.</li>`)}</ul>` : ""}
  <div class="route-wrap">
    <ol class="route" aria-label="Route">${points}</ol>
    <div class="route__train" data-train-marker hidden aria-hidden="true"></div>
  </div>
</section>`;
}

export function trainView(res: ServiceResult, uid: string, at: string, to: string, stop: StopSummary | null, off: StopSummary | null): Html {
  const s = res.timeline.service;
  const start = s.origins[0]?.time ?? null;
  const ends = s.destinations[0]?.time ?? null;
  const title = `${start != null ? `${hm(start)} ` : ""}${originName(s)} to ${destinationName(s)}`;
  const label = [s.operatorName, s.headcode ? ` · ${s.headcode}` : "", s.vehicles ? ` · ${s.vehicles} coaches` : "",
    s.leadingClass ? ` · Class ${s.leadingClass}` : "", s.branding ? ` · ${s.branding}` : ""];
  return html`
<article class="stack train" data-train data-uid="${uid}" data-at="${at}" data-to="${to}" data-title="${title}" data-day="${s.runDate}" data-ends="${ends ?? ""}">
  <header class="train__head">
    <p class="label">${label}</p>
    <h1>${start != null ? html`<span class="tnum">${hm(start)}</span> ` : ""}${originName(s)} to ${destinationName(s)}</h1>
    ${s.units.length ? html`<p class="hint">Units ${s.units.join(", ")}</p>` : ""}
    ${s.mode !== "TRAIN" ? html`<p class="banner" role="note">This is a ${s.mode.replaceAll("_", " ").toLowerCase()}, not a train.</p>` : ""}
  </header>
  <div class="cluster train__tools">
    <label class="check"><input type="checkbox" data-toggle-passes checked> Passing points</label>
    <span class="cluster train__actions">
      <button type="button" class="linkish" data-refresh-now>Refresh</button>
      <button type="button" class="linkish" data-jump>Jump to train</button>
    </span>
    <p class="hint train__note" data-refresh-note role="status" aria-live="polite"></p>
  </div>
  <div data-live-region>${liveRegion(res, at, to, stop, off)}</div>
  <details class="legend">
    <summary>How to read this</summary>
    <dl class="legend__list">
      <dt><span class="src-actual tnum">14:41</span></dt><dd>Reported by Realtime Trains, to the minute on the free plan and to the quarter minute (¼ ½ ¾) with detailed mode.</dd>
      <dt><span class="src-forecast tnum">14:41</span></dt><dd>Realtime Trains’ forecast.</dd>
      <dt><span class="src-est tnum">14:41<span class="est">est</span></span></dt><dd>Our estimate, where Realtime Trains gives none. It carries the delay forward and allows for booked recovery time.</dd>
      <dt><span class="tick" aria-hidden="true"></span> Small rows</dt><dd>Timing points the train passes without stopping: junctions and stations it runs through. Booked times there are working-timetable times, which can be on the half minute (½). Signals aren't in Realtime Trains' data.</dd>
      <dt><span class="train-swatch" aria-hidden="true"></span> Yellow panel</dt><dd>Where we think the train is now. Between reports it moves at the booked speed for that section and stops short of the next point until that point is reported.</dd>
    </dl>
  </details>
</article>`;
}

// ---- settings ----
export interface UpdateInfo {
  state: "idle" | "checking" | "current" | "available" | "error";
  current: string;
  latest?: string;
  url?: string; // the APK to download
  page?: string; // the release page
  notes?: string;
  message?: string;
  checkedAt?: Ms;
}

export function settingsView(o: {
  demo: boolean; tier: Tier; info: TokenInfo | null; hint: string | null; tokenError: string | null; budget: BudgetState;
  message?: string | null; error?: string | null; update: UpdateInfo; native: boolean;
}): Html {
  const isCurrent = (name: string) => o.tier.name === name || (name === "Team" && o.tier.name === "Team or above");
  const u = o.update;
  const updateBody =
    u.state === "available" ? html`<p><strong>Version ${u.latest} is available</strong> (you have ${u.current}).</p>
        ${u.notes ? html`<p class="hint">${u.notes}</p>` : ""}
        <p><a class="button" href="${u.url ?? u.page}" target="_blank" rel="noopener" data-download>Download ${u.latest}</a></p>
        <p class="hint">Android asks to install it over this version. Your key and journeys stay.</p>`
    : u.state === "current" ? html`<p>${u.message ? `${u.message} You have ${u.current}.` : `You have the latest version (${u.current}).`}</p>`
    : u.state === "checking" ? html`<p>Checking…</p>`
    : u.state === "error" ? html`<p class="problem">${u.message}</p>`
    : html`<p>Version ${u.current}.</p>`;
  return html`
<div class="stack prose settings">
  <h1>Settings</h1>
  ${o.message ? html`<p class="banner" role="status">${o.message}</p>` : ""}
  ${o.error ? html`<p class="problem" role="alert">${o.error}</p>` : ""}
  <section class="stack" aria-labelledby="key-h">
    <h2 id="key-h">Realtime Trains key</h2>
    ${o.demo
      ? html`<p>No key yet, so the trains you see are <strong>simulated</strong>. Get a free key at
          <a href="https://api-portal.rtt.io" target="_blank" rel="noopener">api-portal.rtt.io</a>, then paste it here.</p>`
      : html`<dl class="facts">
        <dt>Plan</dt><dd><strong>${o.tier.name}</strong></dd>
        <dt>Key</dt><dd class="tnum">${o.hint ?? "set"}${o.info ? ` (${o.info.kind} token)` : ""}</dd>
        ${o.tokenError ? html`<dt>Problem</dt><dd class="problem">${o.tokenError}</dd>` : ""}
        <dt>Times</dt><dd>Reported ${precision(o.tier)}</dd>
        <dt>Allowance</dt><dd class="tnum">${o.budget.remaining.minute} of ${o.tier.perMinute} left this minute, ${o.budget.remaining.hour} of ${o.tier.perHour} this hour</dd>
        ${o.info?.historyDays ? html`<dt>History</dt><dd>Trains from the last ${o.info.historyDays} days</dd>` : ""}
      </dl>`}
    <form class="stack" data-key-form autocomplete="off">
      <div class="field">
        <label for="token">${o.demo ? "Paste your key" : "Replace key"}</label>
        <input id="token" name="token" type="password" required minlength="20" spellcheck="false" autocapitalize="off" autocomplete="off" placeholder="eyJ…">
      </div>
      <p class="hint">It's checked with Realtime Trains first (1 to 3 calls), then kept <strong>only on this ${o.native ? "phone" : "device"}</strong>${
        o.native ? ", in the app's private storage" : ""}. The app talks to Realtime Trains directly, so your key never goes anywhere else.</p>
      <button class="button" type="submit">Check and save key</button>
    </form>
    ${o.demo ? "" : html`<p><button class="linkish" type="button" data-forget-key>Forget my key on this ${o.native ? "phone" : "device"}</button></p>`}
  </section>
  <section class="stack" aria-labelledby="update-h">
    <h2 id="update-h">Updates</h2>
    <div data-update-body>${updateBody}</div>
    <p><button class="linkish" type="button" data-check-update>Check for updates</button></p>
    <p class="hint">Asks GitHub for the latest release of LiveLine. Nothing else is sent.</p>
  </section>
  <section class="stack" aria-labelledby="tier-h">
    <h2 id="tier-h">What each plan gives you here</h2>
    <table class="tiers">
      <thead><tr><th scope="col">Plan</th><th scope="col">In this app</th><th scope="col">Cost</th></tr></thead>
      <tbody>${TIERS.map(([name, what, cost]) => html`
        <tr class="${isCurrent(name) ? "is-current" : null}" aria-current="${isCurrent(name) ? "true" : null}">
          <th scope="row">${name}${isCurrent(name) ? html` <span class="hint">(yours)</span>` : ""}</th><td>${what}</td><td class="tnum">${cost}</td>
        </tr>`)}</tbody>
    </table>
    <p class="hint">The app switches features on from what your key is actually allowed, as Realtime Trains reports it.
      A higher plan's bigger allowance means trains refresh more often, worked out from the limits each answer reports.</p>
  </section>
</div>`;
}

export function aboutView(demo: boolean, info: TokenInfo | null, tokenError: string | null, budget: BudgetState, version: string): Html {
  return html`
<div class="stack prose">
  <h1>About</h1>
  <p>LiveLine shows where your train is between stations. Realtime Trains records the time each train passes every timing point: stations, junctions and the stations it runs through. Between those reports, this app places the train on the line at the booked speed for that section.</p>
  <h2>Data source</h2>
  ${demo ? html`<p class="banner banner--demo"><strong>Demo mode.</strong> No Realtime Trains key is set, so every train here is simulated on two real routes: Paddington to Oxford, and Waterloo to Woking.</p>
    <p>To see real trains:</p>
    <ol class="steps"><li>Sign in at <a href="https://api-portal.rtt.io" target="_blank" rel="noopener">api-portal.rtt.io</a> and request a key. The free plan is enough.</li>
      <li>Paste it in <a href="#/settings">Settings</a>. It stays on this device.</li></ol>`
  : html`<dl class="facts">
    <dt>Key</dt><dd>${tokenError ? html`<span class="problem">${tokenError}</span>` : info ? `Working (${info.kind} token)` : "Not checked yet"}</dd>
    ${info ? html`<dt>API version</dt><dd>${info.apiVersion ?? "unknown"}</dd>
      <dt>Detailed mode</dt><dd>${info.entitlements.includes("allowDetailed") ? "On" : "Off (it comes with the paid plans)"}</dd>
      <dt>Entitlements</dt><dd>${info.entitlements.join(", ") || "none (free plan)"}</dd>` : ""}
  </dl>`}
  <h2>Allowance</h2>
  <p>Realtime Trains limits how often your key can ask. Answers are kept for a minute (boards) or 30 seconds (trains), and calls go straight from this device to Realtime Trains.</p>
  <dl class="facts tnum">
    <dt>This minute</dt><dd>${budget.remaining.minute} of ${budget.limits.minute} left</dd>
    <dt>This hour</dt><dd>${budget.remaining.hour} of ${budget.limits.hour} left</dd>
    <dt>Today</dt><dd>${budget.remaining.day} of ${budget.limits.day} left</dd>
  </dl>
  <h2>Limits, plainly</h2>
  <ul class="bullets">
    <li>Signals and track circuits aren't in Realtime Trains' data, only timing points. Between two timing points, where the train is shown is our estimate.</li>
    <li>Reports are to the minute (to the quarter minute with detailed mode), so a train can be a little ahead of or behind where it's shown.</li>
    <li>Times marked <span class="src-est">est</span> are ours. Everything else comes from Realtime Trains.</li>
  </ul>
  <p class="hint">Version ${version}. Source: <a href="https://github.com/dusty369289/liveline" target="_blank" rel="noopener">github.com/dusty369289/liveline</a> (MIT).
    Station list: <a href="https://github.com/davwheat/uk-railway-stations" target="_blank" rel="noopener">uk-railway-stations</a> (ODbL), from Trainline EU's data.
    Typeface: Barlow (SIL OFL).</p>
</div>`;
}

