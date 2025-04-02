import type { ServerWebSocket } from "bun";
import type { ServerConfig } from "./types";
import type { BunextServer } from "../.bunext/react-ssr/server";
import type { BunextRequest } from "./bunextRequest";
import type {
  revalidateEvery,
  revalidate,
  revalidateStatic,
} from "../features/router";
import packageJson from "../package.json";
import { useSession, GetSession } from "../features/session";
import { navigate, usePathname } from "./router/index";
import { Database } from "../database/index";

declare global {
  var socketList: ServerWebSocket<unknown>[];
  var dryRun: boolean;
  var __BUNEXT_DEV_INIT: boolean;
  var webSocket: undefined | WebSocket;
  //@ts-ignore
  var Server: undefined | BunextServer;
  var clusterStatus: boolean;
  var serverConfig: ServerConfig;
  var dev: {
    current_dev_path?: string;
  };
  var Bunext: BunextType;
}
globalThis.socketList ??= [];
globalThis.dryRun ??= true;
globalThis.dev ??= {
  current_dev_path: undefined,
};

if (typeof window == "undefined") {
  const router = await import("../features/router");
  const req = await import("./bunextRequest");

  globalThis.Bunext ??= {
    version: packageJson.version,
    request: {
      bunext: req.BunextRequest,
    },
    router: {
      revalidate: {
        static: router.revalidateStatic,
        ssr: {
          now: router.revalidate,
          every: router.revalidateEvery,
        },
      },
      navigate,
      hook: {
        usePathname,
      },
    },
    session: {
      hook: {
        useSession: useSession,
      },
      get: GetSession,
    },
    database: Database(),
  };
} else {
  globalThis.Bunext ??= {
    version: packageJson.version,
    request: {
      bunext: undefined as any,
    },
    router: {
      revalidate: {
        static: undefined as any,
        ssr: {
          now: undefined as any,
          every: undefined as any,
        },
      },
      navigate,
      hook: {
        usePathname,
      },
    },
    session: {
      hook: {
        useSession,
      },
      get: undefined as any,
    },
    database: undefined as any,
  };
}

type BunextType = {
  version: string;
  /** server only */
  request: {
    bunext: typeof BunextRequest;
  };
  /** server only */
  router: {
    revalidate: {
      /**
       * revalidate the specific path like: /some/path/id_1
       * @param pathname pathLike of the route you want to revalidate
       * @param timeout timeout in seconds
       */
      static: typeof revalidateStatic;
      ssr: {
        /**
         * @param path relative path from src/pages Exemple: "/" or "/user"
         */
        now: typeof revalidate;
        /**
         * @param path relative path from src/pages Exemple: "/" or "/user"
         * @param seconde every x seconde to revalide
         */
        every: typeof revalidateEvery;
      };
    };
    navigate: typeof navigate;
    hook: {
      /**
       * a hook that returns the current pathname
       * @returns the current pathname
       */
      usePathname: typeof usePathname;
    };
  };
  session: {
    hook: {
      /**
       * return the session object
       */
      useSession: typeof useSession;
    };
    /**
     * get session from a server context ( ServerAction )
     * @param args
     * @example GetSession(arguments)
     */
    get: typeof GetSession;
  };
  database: ReturnType<typeof Database>;
};
