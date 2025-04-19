import "./server_global.ts";
import packageJson from "../../package.json";
import BunextGlobalDatabaseInit from "../../database/bunext_object/server";
import BunextGlobalPluginsInit from "../../plugins/bunext_object/server";
import BunextGlobalRouterInit from "../../features/router/bunext_object/server";
import BunextGlobalSessionInit from "../../features/session/bunext_object/server";
import BunextGlobalRequestInit from "../../features/request/bunext_object/server";
import ContentTypeInit from "../../features/components/bunext_global/server";

globalThis.Bunext ??= {
  version: packageJson.version,
  //@ts-ignore
  request: BunextGlobalRequestInit,
  //@ts-ignore
  database: BunextGlobalDatabaseInit,
  //@ts-ignore
  plugins: BunextGlobalPluginsInit,
  router: BunextGlobalRouterInit,
  //@ts-ignore
  session: BunextGlobalSessionInit,
  components: ContentTypeInit,
};
