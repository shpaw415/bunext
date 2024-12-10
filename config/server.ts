import type { ServerConfig } from "@bunpmjs/bunext/internal/types";
const Config: ServerConfig = {
  HTTPServer: {
    port: 3010,
    threads: 4,
  },
  Dev: {
    hotServerPort: 3005,
  },
  build: {
    plugins: [],
  },
  session: {
    timeout: 3600,
    type: "cookie",
  },
};

export default Config;
