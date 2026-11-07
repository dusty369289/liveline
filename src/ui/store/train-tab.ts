// Which way the train page shows a train, kept so it opens the way you last left it.
import { KEYS } from "./keys";
import { Pref } from "./pref";

export const TRAIN_TABS = [["route", "Route"], ["scene", "Train view"]] as const;
export type TrainTabName = (typeof TRAIN_TABS)[number][0];

export class TrainTab {
  private readonly pref = new Pref<string>(KEYS.trainTab, "route");

  get(): TrainTabName {
    const v = this.pref.get();
    return TRAIN_TABS.some(([t]) => t === v) ? (v as TrainTabName) : "route";
  }

  set(v: string): void {
    if (TRAIN_TABS.some(([t]) => t === v)) this.pref.set(v);
  }
}
