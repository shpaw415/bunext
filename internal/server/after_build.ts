import type { ServerConfig } from "../types.ts";
import "./server_global.ts";

export default function AfterBuildPluginMaker(
  isEnabled: (config: ServerConfig) => boolean,
  plugin: (BuildArtifact: Bun.BuildArtifact) => Promise<void> | void
) {
  if (!isEnabled(globalThis.serverConfig)) return undefined;
  return plugin;
}
