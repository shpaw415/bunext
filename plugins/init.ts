import { builder } from "../internal/server/build";
import type { BunextPlugin } from "./types";
import { Init } from "../internal/server/router";

export default {
  serverStart: {
    dev() {
      builder.clearBuildDir();
    },
    async main() {
      await Init();
      try {
        // fix .svg module not typed correctly
        await Bun.$`mv node_modules/@types/bun/node_modules/bun-types/extensions.d.ts node_modules/@types/bun/node_modules/bun-types/extensions.d.ts.bak`.quiet();
      } catch {}
    },
    async cluster() {
      await Init();
    },
  },
} as BunextPlugin;
