import type { BunPlugin } from "bun";

export class BuildFix {
  plugin: BunPlugin;
  afterBuildCallback?: (buildPath: string) => void;
  constructor({
    plugin,
    afterBuild,
  }: {
    plugin: BunPlugin;
    afterBuild?: (buildPath: string) => void;
  }) {
    this.plugin = plugin;
    this.afterBuildCallback = afterBuild;
  }
}
