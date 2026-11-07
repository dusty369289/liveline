import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "dev.liveline.app",
  appName: "LiveLine",
  webDir: "dist",
  android: {
    // WebView debugging follows Capacitor's default: on in debug builds only (used by the device test pass)
    allowMixedContent: false,
  },
  server: {
    androidScheme: "https",
  },
};

export default config;
