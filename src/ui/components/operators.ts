// Each operator's short name, by the two-letter code Realtime Trains gives (operator.code): its real abbreviation
// where it has one (GWR, LNER, c2c), and otherwise its brand as written (Southern, Elizabeth line), never an invented
// one. Shown on a badge in its brand colour in the Operator colour theme (themes/operators.css, which
// test/operators.test.ts keeps in step with this list). A code not here gets no badge.
import { type Html, html } from "../html";

export const OPERATORS: Readonly<Record<string, string>> = {
  AW: "TfW", CC: "c2c", CH: "Chiltern", CS: "Caledonian Sleeper", EM: "EMR", ES: "Eurostar", GC: "Grand Central",
  GN: "Great Northern", GR: "LNER", GW: "GWR", GX: "Gatwick Express", HT: "Hull Trains", HX: "HEx", IL: "Island Line",
  LD: "Lumo", LE: "Greater Anglia", "LM-LNR": "LNR", "LM-WMR": "WMR", LO: "Overground", ME: "Merseyrail",
  NT: "Northern", SE: "Southeastern", SN: "Southern", SR: "ScotRail", SW: "SWR", TL: "Thameslink", TP: "TPE",
  VT: "AWC", XC: "XC", XR: "Elizabeth line",
};

/**
 * Which entry: the code, or for the two West Midlands Trains brands, which share LM, the brand in the operator's
 * name. LM under any other name could be either, so it gets no badge.
 */
function key(code: string, name: string): string {
  if (code !== "LM") return code;
  if (/northwestern/i.test(name)) return "LM-LNR";
  if (/west midlands railway/i.test(name)) return "LM-WMR";
  return "";
}

/** The operator's badge, or nothing. Hidden from screen readers: the row already says the operator's full name. */
export function operatorBadge(code: string, name: string): Html | "" {
  const k = key(code, name);
  const short = OPERATORS[k];
  return short ? html`<span class="trains__op" data-op="${k}" aria-hidden="true">${short}</span>` : "";
}

/** What the train page's data-op carries, so its header takes the operator's colour (as the badge's key). */
export const operatorKey = key;
