import { normalize } from "node:path";
import type { BunextPlugin } from "../../plugins/types";

export class PluginLoader {
  protected Plugins: BunextPlugin[] = [];
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
  }

  getPlugins() {
    return this.Plugins;
  }
}
