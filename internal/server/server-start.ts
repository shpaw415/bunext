"server only";

import { pluginLoader } from "./plugin-loader";

// this is called on server start

declare global {
  var __BUNEXT_SERVER_START_PLUGIN_DRY__: boolean;
}
globalThis.__BUNEXT_SERVER_START_PLUGIN_DRY__ ??= false;

export default async function Make() {
  if (globalThis.__BUNEXT_SERVER_START_PLUGIN_DRY__) {
    return;
  }
  globalThis.__BUNEXT_SERVER_START_PLUGIN_DRY__ = true;

  if (process.env.NODE_ENV == "development") {
    await Promise.all(pluginLoader.getSubPluginsByParentName("serverStart", "dev").map((plugin) => {
      try {
        return plugin.subPlugin();
      } catch (e) {
        console.error(`OnServerStart plugin failed, name: ${plugin.name}:`, e);
      }
    }));
  }

  await Promise.all(
    pluginLoader.getSubPluginsByParentName("serverStart", "main").map(async (plugin) => {
      try {
        await plugin.subPlugin();
      } catch (e) {
        console.error(`OnServerStart plugin failed, name: ${plugin.name}:`, e);
      }
    })
  );
}

export async function OnServerStartCluster() {
  await pluginLoader.init();
  await Promise.all(pluginLoader.getSubPluginsByParentName("serverStart", "cluster").map((p) => p.subPlugin()));
}
