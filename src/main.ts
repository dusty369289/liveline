// Start-up: build the core over the platform's network and storage, then hand over to the app shell.
import { Rail } from "./core/rail";
import { StationIndex } from "./core/stations";
import stationsRaw from "./data/stations.json";
import { rttHttp, store } from "./platform";
import { App } from "./ui/app";

const stations = StationIndex.fromRaw(stationsRaw as Array<Record<string, unknown>>);
const rail = new Rail(rttHttp, store, stations);
const app = new App(document.getElementById("app")!, rail);
void app.start();
