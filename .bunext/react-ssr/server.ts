import { BunextServer } from "bunext-js/internal/server/index.ts";
import { Shell } from "./shell";
import onRequest from "../../config/onRequest";

if (!globalThis.Server || process.env.NODE_ENV == "production") {
  (globalThis as any).Server = await new BunextServer({
    Shell: Shell as any,
    onRequest,
    preloadModulePath: process.cwd() + "/config/preload.ts",
  }).init();
} else await globalThis.Server.init();
