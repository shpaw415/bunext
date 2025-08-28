import type { ServerConfig } from "bunext-js/types";
import tailwindPlugin from "../external-plugins/tailwind";

const Config: ServerConfig = {
  HTTPServer: {
    port: 3010,
    threads: 1,
  },
  Dev: {
    hotServerPort: 3005,
    devtoolPanel: false,
  },
  build: {
    plugins: [],

  },
  session: {
    timeout: 3600,
    type: "database:hard",
  },
  router: {
    //dynamicPaths: ["src/dynamic"],
  },
  bunext_plugins: [
    {
      build: {
        buildOptions: {
          "minify": false
        }
      }
    }
  ],
  html_lang(request) {
    const params = request.getRequestParams<{ lang?: string }>();
    return params.lang || "en";
  },
};

export default Config;
