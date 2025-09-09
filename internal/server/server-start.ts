"server only";

import { IPCManager } from "plugins/utils";
import { pluginLoader } from "./plugin-loader";
import cluster from "node:cluster";
// this is called on server start



export async function onServerStartPlugins() {

  const ipc = IPCManager.getInstanceForCurrentProcess() as IPCManager<"main" | "cluster">;

  if (cluster.isWorker) {
    await Promise.all(pluginLoader.getSubPluginsByParentName("serverStart", "cluster").map((p) => p.subPlugin(ipc as IPCManager<"cluster">)));
    return;
  }

  await Promise.all(
    pluginLoader.getSubPluginsByParentName("serverStart", "main").map(async (plugin) => {
      try {
        await plugin.subPlugin(ipc as IPCManager<"main">);
      } catch (e) {
        console.error(`OnServerStart plugin failed, name: ${plugin.name}:`, e);
      }
    })
  );

  if (process.env.NODE_ENV == "development") {
    await Promise.all(pluginLoader.getSubPluginsByParentName("serverStart", "dev_main").map((plugin) => {
      try {
        return plugin.subPlugin(ipc as IPCManager<"main">);
      } catch (e) {
        console.error(`OnServerStart plugin failed, name: ${plugin.name}:`, e);
      }
    }));
  }
}
