import { BunextServer } from "bunext-js/server/bunext-server";
import { Shell } from "./shell";
import onRequest from "../../config/onRequest";

await BunextServer.getInitedInstance({
  Shell: Shell as any,
  onRequest,
  preloadModulePath: process.cwd() + "/config/preload.ts",
});
