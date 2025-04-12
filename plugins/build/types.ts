import type { BunPlugin } from "bun";

export type Build_Plugins = {
  plugin?: BunPlugin;
  buildOptions?: Partial<Bun.BuildConfig>;
};
