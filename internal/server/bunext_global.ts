import packageJson from "../../package.json";
import BunextGlobalDatabaseInit from "../../database/bunext_object/server";
import BunextGlobalPluginsInit from "../../plugins/bunext_object/server";
import BunextGlobalRouterInit from "../../features/router/bunext_object/server";
import BunextGlobalSessionInit from "../../features/session/bunext_object/server";
import BunextGlobalRequestInit from "../../features/request/bunext_object/server";
import { InitGlobalServerConfig } from "./global_init.ts";

await InitGlobalServerConfig();

globalThis.Bunext ??= {
  version: packageJson.version,
  request: BunextGlobalRequestInit,
  database: BunextGlobalDatabaseInit,
  plugins: BunextGlobalPluginsInit,
  router: BunextGlobalRouterInit,
  session: BunextGlobalSessionInit,
} as any;
