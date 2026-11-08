// Start-up: build the core over the platform's network and storage, then hand over to the app shell.
import { Rail } from "./core/rail";
import { StationIndex } from "./core/stations";
import stationsRaw from "./data/stations.json";
import { handleBack, rttHttp, store, styleStatusBar } from "./platform";
import { App } from "./ui/app";

// The phone's shell (no-ops in a browser). Neither must stop the app starting if the native side refuses.
void styleStatusBar().catch(() => {});
void handleBack().catch(() => {});

const stations = StationIndex.fromRaw(stationsRaw as Array<Record<string, unknown>>);
const rail = new Rail(rttHttp, store, stations);
const app = new App(document.getElementById("app")!, rail);
void app.start();
