import type { HTML_Rewrite_plugin_function } from "./types";

const SSRPlugin: HTML_Rewrite_plugin_function = (rewriter) => {
  rewriter.on("#BUNEXT_INNER_PAGE_INSERTER", {
    element(element) {
      element.removeAndKeepContent();
    },
  });
};

export default SSRPlugin;
