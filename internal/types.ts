import type { _GlobalData } from "../bun-react-ssr/types";
import type { _Head } from "../componants/head";

export type _globalThis = _GlobalData & {
  __HEAD_DATA__: Record<string, _Head>;
};

/**
 * HTTPServer
 *  - port: HTTP server port
 *
 * Dev
 *  - hotServerPort: Hot reload Server port
 */
export type ServerConfig = {
  HTTPServer: {
    port: number;
  };
  Dev: {
    hotServerPort: number;
  };
};

export type OnRequestType = (
  request: Request
) => Response | void | Promise<Response | void>;
