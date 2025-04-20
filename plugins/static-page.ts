import CacheManager from "../internal/caching";
import type { BunextPlugin } from "./types";

export default {
  serverStart: {
    main() {
      CacheManager.clearStaticPage();
    },
  },
} as BunextPlugin;
