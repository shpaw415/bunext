"server only";
import { BunextServer } from "bunext-js/server/bunext-server";
import { Shell } from "bunext-js/client/shell";
import onRequest from "../../config/onRequest";

await BunextServer.getInitedInstance({
  Shell,
  onRequest,
  preloadModulePath: process.cwd() + "/config/preload.ts",
});
