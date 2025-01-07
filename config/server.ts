import type { ServerConfig } from "@bunpmjs/bunext/internal/types";
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
};

export default Config;
