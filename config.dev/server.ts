import type { ServerConfig } from "bunext-js/types";
import tailwindPlugin from "../external-plugins/tailwind";

const Config: ServerConfig = {
  HTTPServer: {
    port: 3010,
    threads: 1,
  },
  Dev: {
    hotServerPort: 3005,
    devtoolPanel: true,
  },
  build: {
    plugins: [],
  },
  session: {
    timeout: 3600,
    type: "database:hard",
  },
  router: {
    dynamicPaths: ["src/dynamic"],
  },
  bunext_plugins: [
  ],
  html_lang(request) {
    return "fr"
  },
};

export default Config;
