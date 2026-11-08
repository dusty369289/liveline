// Every name the UI stores data under, in one place. Renaming one forgets what users saved under the old name, so
// never rename or reuse one without a migration. test/persistence.test.ts pins this list, and
// test/architecture.test.ts fails if a storage name is written anywhere else. (The key itself is kept by the core,
// in the platform's private store: src/core/keys.ts.)
export const KEYS = {
  recentStations: "liveline.recent",
  journeys: "liveline.journeys",
  trains: "liveline.trains",
  tracking: "liveline.tracking", // the single train older versions kept; still read once and written
  update: "liveline.update",
  marker: "liveline.marker",
  trainTab: "liveline.trainTab", // Route or Train view, whichever you used last
  theme: "liveline.theme", // Settings > Appearance
} as const;

export type Key = (typeof KEYS)[keyof typeof KEYS];
