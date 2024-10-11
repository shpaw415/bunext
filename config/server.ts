import type { ServerConfig } from "@bunpmjs/bunext/internal/types";
const Config: ServerConfig = {
  HTTPServer: {
    port: 3000,
    threads: 1,
  },
  Dev: {
    hotServerPort: 3001,
  },
  build: {
    plugins: [],
  },
  session: {
    timeout: 3600,
    type: "database:memory",
  },
};

export default Config;
