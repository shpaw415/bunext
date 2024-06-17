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
};

export default Config;
