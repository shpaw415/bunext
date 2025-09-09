"server only";

import { normalize } from "node:path";
import type { BunextPlugin } from "../../plugins/types";


declare global {
  var __PLUGIN_LOADER__: __PluginLoader__;
}

class __PluginLoader__ {
  protected Plugins: Array<BunextPlugin & { filePaths: string }> = [];
  private plugin_cache: Map<keyof BunextPlugin, Array<{ name: string, pluginParent: BunextPlugin[keyof BunextPlugin] }>> = new Map();
  private sub_plugin_cache: Map<string, Array<any>> = new Map();
  private plugin_inited = false;

  async init() {
    if (this.plugin_inited) return;
    this.plugin_inited = true;
    const plugins_files_paths = Array.from(
      new Bun.Glob("**/*.ts").scanSync({
        cwd: normalize(`${import.meta.dirname}/../../plugins`),
        onlyFiles: true,
        absolute: true,
      })
    ).filter((path) => !path.endsWith(".test.ts"));

    this.Plugins.push(
      ...(
        (await Promise.all(
          plugins_files_paths.map(
            async (path) => {
              const plugin = (await import(path) as { default: BunextPlugin | undefined })?.default;
              if (!plugin) return undefined;
              return { ...plugin, filePaths: path };
            }
          )
        )).filter((f) => f != undefined))
    );

    this.Plugins.push(
      ...((serverConfig?.bunext_plugins as Array<BunextPlugin>).map((p) => ({ ...p, filePaths: "client-plugin" })) ?? [])
    );

    this.Plugins = this.Plugins.sort((a, b) => {

      return ((a?.priority ?? 1000) - (b?.priority ?? 1000));
    });


    // Clear caches when plugins are reinitialized
    this.clearCaches();
  }

  clearCaches() {
    this.plugin_cache.clear();
    this.sub_plugin_cache.clear();
  }

  getPlugins() {
    return this.Plugins;
  }

  getPluginByName<T extends keyof BunextPlugin>(name: T): Array<{ name: string, pluginParent: NonNullable<BunextPlugin[T]> }> {
    const cached = this.plugin_cache.get(name);
    if (cached) return cached as Array<{ name: string, pluginParent: NonNullable<BunextPlugin[T]> }>;

    const pluginArray = this.Plugins.map((plugin) => ({ name: plugin.name, pluginParent: plugin[name] as NonNullable<BunextPlugin[T]> })).filter((value) => value.pluginParent !== undefined);
    this.plugin_cache.set(name, pluginArray);
    return pluginArray;
  }

  private getSubPluginsByName<
    T extends keyof BunextPlugin,
    K extends keyof NonNullable<BunextPlugin[T]>
  >(
    name: K,
    from: Array<{ name: string, pluginParent: NonNullable<BunextPlugin[T]> }>,
    parentKey: T
  ): Array<{ name: string, subPlugin: NonNullable<NonNullable<BunextPlugin[T]>[K]> }> {
    // Create a cache key that combines the parent key, sub key, and a hash of the from array
    const cacheKey = `${String(parentKey)}.${String(name)}.${from.length}`;

    const cached = this.sub_plugin_cache.get(cacheKey);
    if (cached) return cached as Array<{ name: string, subPlugin: NonNullable<NonNullable<BunextPlugin[T]>[K]> }>;


    const subPluginArray = from
      .map((sub) => ({ name: sub.name, subPlugin: (sub.pluginParent as any)[name] }))
      .filter((value) => value.subPlugin !== undefined);


    this.sub_plugin_cache.set(cacheKey, subPluginArray);
    return subPluginArray;
  }

  /**
   * Convenience method that gets plugins by name and then gets sub-plugins.
   * This method is fully cached and type-safe.
   */
  getSubPluginsByParentName<
    T extends keyof BunextPlugin,
    K extends keyof NonNullable<BunextPlugin[T]>
  >(
    parentName: T,
    subName: K
  ): Array<{ name: string, subPlugin: NonNullable<NonNullable<BunextPlugin[T]>[K]> }> {
    const parentPlugins = this.getPluginByName(parentName);
    return this.getSubPluginsByName(subName, parentPlugins, parentName);
  }
}


const pluginLoader = globalThis.__PLUGIN_LOADER__ ??= new __PluginLoader__();


export { pluginLoader };
