import type { ServerConfig } from "@bunpmjs/bunext/internal/types";
const Config: ServerConfig = {
  HTTPServer: {
    port: 3000,
  },
  Dev: {
    hotServerPort: 3001,
  },
  build: {
    plugins: [],
  },
  session: {
    timeout: 3600,
  },
};

export default Config;
