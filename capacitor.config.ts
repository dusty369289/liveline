import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "dev.liveline.app",
  appName: "LiveLine",
  webDir: "dist",
  android: {
    // WebView debugging follows Capacitor's default: on in debug builds only (used by the device test pass)
    allowMixedContent: false,
  },
  // appId, androidScheme and hostname must never change: Android keeps app data across updates, but WebView storage
  // (journeys, recent stations) is per origin (https://localhost), and a new appId is a different app. test/persistence.test.ts pins them.
  plugins: {
    // Edge to edge, as Android 15+ draws apps: the page honours viewport-fit=cover and steps around the status bar,
    // notch and gesture bar with env(safe-area-inset-*) (topbar, sticky train bar, footer, page sides).
    SystemBars: { insetsHandling: "native" },
  },
  server: {
    androidScheme: "https",
    hostname: "localhost",
  },
};

export default config;
