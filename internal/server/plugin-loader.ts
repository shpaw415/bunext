"server only";

import { normalize } from "node:path";
import type { BunextPlugin } from "../../plugins/types";

type NoUndefinedField<T> = { [P in keyof T]-?: NoUndefinedField<NonNullable<T[P]>> };

export class PluginLoader {
  protected Plugins: BunextPlugin[] = [];
  private plugin_cache: Map<keyof BunextPlugin, Array<BunextPlugin[keyof BunextPlugin]>> = new Map();
  private sub_plugin_cache: Map<string, Array<any>> = new Map();
  private plugin_inited = false;

  async initPlugins() {
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
        await Promise.all(
          plugins_files_paths.map(
            async (path) =>
              (
                await import(path)
              )?.default as BunextPlugin | undefined
          )
        )
      ).filter((f) => f != undefined)
    );

    this.Plugins.push(
      ...((serverConfig?.bunext_plugins as Array<BunextPlugin>) ?? [])
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

  getPluginByName<T extends keyof BunextPlugin>(name: T): Array<NonNullable<BunextPlugin[T]>> {
    const cached = this.plugin_cache.get(name);
    if (cached) return cached as Array<NonNullable<BunextPlugin[T]>>;

    const pluginArray = this.Plugins.map((plugin) => plugin[name]).filter((value) => value !== undefined);
    this.plugin_cache.set(name, pluginArray);
    return pluginArray;
  }

  getSubPluginsByName<
    T extends keyof BunextPlugin,
    K extends keyof NonNullable<BunextPlugin[T]>
  >(
    name: K,
    from: Array<BunextPlugin[T]>,
    parentKey: T
  ): Array<NonNullable<NonNullable<BunextPlugin[T]>[K]>> {
    // Create a cache key that combines the parent key, sub key, and a hash of the from array
    const cacheKey = `${String(parentKey)}.${String(name)}.${from.length}`;

    const cached = this.sub_plugin_cache.get(cacheKey);
    if (cached) return cached as Array<NonNullable<NonNullable<BunextPlugin[T]>[K]>>;

    const subPluginArray = from
      .map((plugin) => plugin && typeof plugin === 'object' ? (plugin as any)[name] : undefined)
      .filter((value) => value !== undefined);

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
  ): Array<NonNullable<NonNullable<BunextPlugin[T]>[K]>> {
    const parentPlugins = this.getPluginByName(parentName);
    return this.getSubPluginsByName(subName, parentPlugins, parentName);
  }
}
