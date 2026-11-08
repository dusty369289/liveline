// RTT's word for where a train is (approaching, at the platform...) reads the same on a board and on the train page.
import { describe, expect, it } from "vitest";
import { TRAIN_STATUSES, type TrainStatus } from "../src/core/models";
import { parseBoard } from "../src/core/parse";
import { Rail } from "../src/core/rail";
import { SimTransport } from "../src/core/simulator";
import { fromLondon } from "../src/core/time";
import { boardView } from "../src/ui/views/board";
import { liveRegion } from "../src/ui/views/live-region";
import { MemStore, stations } from "./support";

const NAV = { earlier: "", later: "", refresh: "", switch: "", all: "", change: "" };
const text = (h: { value: string }) => h.value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

/** What a status adds to a page: the text with it, less the text without it. */
function added(withIt: string, without: string): string {
  let i = 0;
  while (i < without.length && withIt[i] === without[i]) i++;
  let j = 0;
  while (j < without.length - i && withIt[withIt.length - 1 - j] === without[without.length - 1 - j]) j++;
  return withIt.slice(i, withIt.length - j).replace(/^[\s·]+|[\s·]+$/g, "");
}

describe("train status words", async () => {
  const now = fromLondon(2026, 11, 7, 9, 0);
  const rail = new Rail(new SimTransport(() => now), new MemStore(), stations, () => now);
  await rail.start();
  const board = await rail.board({ station: "PAD" });
  const row = board.rows.find((r) => r.operatorName)!;
  const train = await rail.service(row.uniqueId);
  const call = train.timeline.points.find((v) => v.point.kind === "call" && v.point.public)!;

  const onBoard = (s: TrainStatus | null) =>
    text(boardView({ ...board, rows: [{ ...row, status: s }] }, NAV, false, now));
  const onTrain = (s: TrainStatus | null) => {
    call.point.status = s;
    return text(liveRegion(train, null, null));
  };

  it.each(TRAIN_STATUSES)("%s reads the same on the board and the train page", (s) => {
    const word = added(onBoard(s), onBoard(null));
    expect(word).not.toBe("");
    expect(added(onTrain(s), onTrain(null))).toBe(word);
  });

  it("ARRIVING says Arriving", () => {
    expect(added(onBoard("ARRIVING"), onBoard(null))).toBe("Arriving");
  });

  it("a status RTT adds later is dropped, not shown raw", () => {
    const body = { query: { location: { name: "Reading", shortCodes: ["RDG"] } }, services: [{ scheduleMetadata: { identity: "X1", departureDate: "2026-11-07" },
      temporalData: { departure: { scheduleAdvertised: "2026-11-07T09:00:00" }, status: "HOVERING" } }] };
    const parsed = parseBoard(body, { fallbackName: "Reading", timeFrom: now, timeTo: now + 3_600_000, today: () => now });
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].status).toBeNull();
  });
});
