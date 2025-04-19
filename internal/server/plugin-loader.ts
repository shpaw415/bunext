import { normalize } from "node:path";
import type { BunextPlugin } from "../../plugins/types";

export class PluginLoader {
  protected Plugins: BunextPlugin[] = [];
  private Plugin_inited = false;

  async getPlugins() {
    if (this.Plugin_inited) return this.Plugins;
    this.Plugin_inited = true;

    const plugins_files_paths = Array.from(
      new Bun.Glob("**/*.ts").scanSync({
        cwd: normalize(`${import.meta.dirname}/../../plugins`),
        onlyFiles: true,
        absolute: true,
      })
    );

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

    return this.Plugins;
  }

  async PluginLoader<T>(path: string) {
    const plugins_files_paths = Array.from(
      new Bun.Glob("**/*.ts").scanSync({
        cwd: normalize(`${import.meta.dirname}/../../plugins/${path}`),
        onlyFiles: true,
        absolute: true,
      })
    );

    return (
      await Promise.all(
        plugins_files_paths.map(
          async (path) => (await import(path)).default as T
        )
      )
    ).filter((f) => f != undefined);
  }
}
