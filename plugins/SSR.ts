import CacheManager from "../internal/caching";
import type { BunextPlugin } from "./types";

export default {
  serverStart: {
    main() {
      CacheManager.clearSSR();
      CacheManager.clearSSRDefaultPage();
    },
  },
  router: {
    html_rewrite: {
      rewrite: (rewriter) => {
        rewriter.on("#BUNEXT_INNER_PAGE_INSERTER", {
          element(element) {
            element.removeAndKeepContent();
          },
        });
      },
    },
  },
} as BunextPlugin;
