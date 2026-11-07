// Names the core stores under, in the platform's private store (Capacitor Preferences on Android). Renaming one
// signs every user out, so never rename or reuse one without a migration. Pinned by test/persistence.test.ts.
export const STORE = {
  key: "rtt.key", // the user's Realtime Trains key
  access: "rtt.access", // the access token derived from it, and its entitlements (no call needed on reopening)
} as const;
