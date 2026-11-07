// An update must keep the user's key, journeys and settings. Android keeps an app's data when a new version with the
// same package name and signing key is installed over it. These pin everything else that would lose it:
// - appId: a new one is a different app, with empty data
// - the WebView origin (scheme + hostname): journeys and recent stations live in its localStorage
// - the names data is stored under (two registries): renaming one forgets it unless there's a migration
// If one of these really must change, write a migration first, then change the test.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import config from "../capacitor.config";
import { STORE } from "../src/core/keys";
import { KEYS } from "../src/ui/store/keys";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

describe("updates keep the user's data", () => {
  it("the app's identity and WebView origin never change", () => {
    expect(config.appId).toBe("dev.liveline.app");
    expect(config.server?.androidScheme).toBe("https");
    expect(config.server?.hostname).toBe("localhost");
    expect(read("../android/app/build.gradle")).toContain('applicationId "dev.liveline.app"');
  });

  it("stored data keeps its names", () => {
    expect(STORE).toEqual({ key: "rtt.key", access: "rtt.access" });
    // "liveline.passes" (the old passing-points switch) went with the switch. "liveline.tracking" is still read once
    // and written, so an update keeps the train you were following.
    expect(KEYS).toEqual({
      recentStations: "liveline.recent",
      journeys: "liveline.journeys",
      trains: "liveline.trains",
      tracking: "liveline.tracking",
      update: "liveline.update",
      marker: "liveline.marker",
      trainTab: "liveline.trainTab", // new in the Train view: nothing older to migrate
    });
  });

  it("Android doesn't back data up to a new phone, but an update in place keeps it", () => {
    const manifest = read("../android/app/src/main/AndroidManifest.xml");
    expect(manifest).toContain('android:allowBackup="false"'); // the key stays on this phone
    expect(manifest).toContain("REQUEST_INSTALL_PACKAGES");
  });
});
