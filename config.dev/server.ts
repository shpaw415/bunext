import type { ServerConfig } from "bunext-js/internal/types.ts";
const Config: ServerConfig = {
  HTTPServer: {
    port: 3010,
    threads: 1,
  },
  Dev: {
    hotServerPort: 3005,
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
  bunext_plugins: [],
};

export default Config;
