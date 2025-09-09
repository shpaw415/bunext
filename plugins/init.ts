import { builder } from "../internal/server/build";
import type { BunextPlugin } from "./types";

export default {
  name: "bunext-init-plugin",
  serverStart: {
    dev() {
      builder.clearBuildDir();
    },
    async main() {
      try {
        // fix .svg module not typed correctly
        await Bun.$`mv node_modules/@types/bun/node_modules/bun-types/extensions.d.ts node_modules/@types/bun/node_modules/bun-types/extensions.d.ts.bak`.quiet();
      } catch { }
    },
  },
} as BunextPlugin;
