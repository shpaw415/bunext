import packageJson from "../../package.json";
import BunextGlobalDatabaseInit from "../../database/bunext_object/client";
import BunextGlobalPluginsInit from "../../plugins/bunext_object/client";
import BunextGlobalRouterInit from "../../features/router/bunext_object/client";
import BunextGlobalSessionInit from "../../features/session/bunext_object/client";
import BunextGlobalRequestInit from "../../features/request/bunext_object/client";
import ContentTypeInit from "../../features/components/bunext_global/server";
import type { BunextType } from "../types";

//@ts-ignore
globalThis.Bunext ??= {
  version: packageJson.version,
  request: BunextGlobalRequestInit,
  database: BunextGlobalDatabaseInit,
  plugins: BunextGlobalPluginsInit,
  router: BunextGlobalRouterInit,
  session: BunextGlobalSessionInit,
  components: ContentTypeInit,
} as BunextType;
