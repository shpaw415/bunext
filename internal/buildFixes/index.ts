import type { BunPlugin } from "bun";
import "../server_global";

type afterBuildCallback = (buildPath: string) => void | Promise<void>;
export class BuildFix {
  plugin: BunPlugin;
  afterBuildCallback?: afterBuildCallback;
  constructor({
    plugin,
    afterBuild,
  }: {
    plugin: BunPlugin;
    afterBuild?: afterBuildCallback;
  }) {
    this.plugin = plugin;
    this.afterBuildCallback = afterBuild;
    this.afterBuildCallback &&
      globalThis.afterBuild.push(this.afterBuildCallback);
  }
}
