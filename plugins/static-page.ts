import CacheManager from "../internal/caching";
import type { BunextPlugin } from "./types";

export default {
  priority: 11,
  serverStart: {
    main() {
      CacheManager.clearStaticPage();
    },
  },
} as BunextPlugin;
