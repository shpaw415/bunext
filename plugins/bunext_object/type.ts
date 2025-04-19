import type { BunextPlugin } from "../types";

export type Plugins = {
  create: (plugin: BunextPlugin) => BunextPlugin;
};
