// An update must keep the user's key, journeys and settings. Android keeps an app's data when a new version with the
// same package name and signing key is installed over it. These pin everything else that would lose it:
// - appId: a new one is a different app, with empty data
// - the WebView origin (scheme + hostname): journeys and recent stations live in its localStorage
// - the names data is stored under: renaming one forgets it unless there's a migration
// If one of these really must change, write a migration first, then change the test.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import config from "../capacitor.config";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

describe("updates keep the user's data", () => {
  it("the app's identity and WebView origin never change", () => {
    expect(config.appId).toBe("dev.liveline.app");
    expect(config.server?.androidScheme).toBe("https");
    expect(config.server?.hostname).toBe("localhost");
    const gradle = read("../android/app/build.gradle");
    expect(gradle).toContain('applicationId "dev.liveline.app"');
  });

  it("stored data keeps its names", () => {
    expect(read("../src/core/rail.ts")).toContain('const KEY = "rtt.key";');
    expect(read("../src/core/rtt.ts")).toContain('const STATE_KEY = "rtt.access";');
    const ui = read("../src/ui/app.ts") + read("../src/ui/live.ts");
    for (const k of ["liveline.recent", "liveline.tracking", "liveline.update", "liveline.passes"]) expect(ui).toContain(`"${k}"`);
    expect(read("../src/ui/app.ts") + read("../src/ui/prefs.ts")).toContain("liveline.journeys");
  });

  it("Android doesn't back data up to a new phone, but an update in place keeps it", () => {
    const manifest = read("../android/app/src/main/AndroidManifest.xml");
    expect(manifest).toContain('android:allowBackup="false"'); // the key stays on this phone
    expect(manifest).toContain("REQUEST_INSTALL_PACKAGES");
  });
});
