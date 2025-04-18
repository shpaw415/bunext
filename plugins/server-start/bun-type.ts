import type { ServerStart } from "./types";

export default {
  async main() {
    try {
      // fix .svg module not typed correctly
      await Bun.$`mv node_modules/@types/bun/node_modules/bun-types/extensions.d.ts node_modules/@types/bun/node_modules/bun-types/extensions.d.ts.bak`.quiet();
    } catch {}
  },
} as ServerStart;
