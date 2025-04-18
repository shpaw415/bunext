import type { ServerStart } from "./types";
import CacheManager from "../../internal/caching";

export default {
  main() {
    CacheManager.clearSSR();
    CacheManager.clearStaticPage();
    CacheManager.clearSSRDefaultPage();
  },
} as ServerStart;
