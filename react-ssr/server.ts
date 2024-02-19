import { doBuild } from "./build";
import { router } from "./routes";
import { Shell } from "./shell";
import type { ServerWebSocket } from "bun";
import "./global";
import { names, paths } from "@bunpmjs/bunext/globals";
import { generateRandomString } from "@bunpmjs/bunext/features/utils";
import { ClientsetHotServer, sendSignal } from "@bunpmjs/bunext/dev/dev";
import { getScriptsList } from "@bunpmjs/bunext/componants/script";
import { webToken } from "@bunpmjs/json-webtoken";

declare global {
  var socketList: ServerWebSocket<unknown>[];
  var dryRun: boolean;
}

globalThis.socketList ??= [];
globalThis.dryRun ??= true;

await init();

try {
  const server = Bun.serve({
    port: 3000,
    async fetch(request) {
      const controller = new middleWare({ req: request });

      if (!request.url.endsWith(".js")) await doBuild();
      const response =
        (await serve(request, controller)) ||
        (await serveStatic(request)) ||
        serveScript(request);
      if (response) return controller.setSessionToken(response as Response);

      globalThis.dryRun = false;
      return new Response("Not found", {
        status: 404,
      });
    },
  });
  console.log("Serve on port:", server.port);
} catch (e) {
  console.log(e);
  process.exit(0);
}

async function init() {
  await doBuild();
  if (globalThis.mode === "dev") {
    serveHotServer();
    ClientsetHotServer();
  }
  sendSignal();
}

function serve(request: Request, controller: middleWare) {
  return router.serve(request, {
    Shell: Shell,
    bootstrapModules: [".bunext/react-ssr/hydrate.js"],
  });
}

function serveHotServer() {
  Bun.serve({
    websocket: {
      message: (ws, message) => {
        console.log("Client sent message", message);
      },
      open(ws) {
        ws.send("welcome");
        socketList.push(ws);
      },
      close(ws) {
        globalThis.socketList.splice(
          socketList.findIndex((s) => s == ws),
          1
        );
      },
    },
    fetch(req, server) {
      const upgraded = server.upgrade(req);
      if (!upgraded) {
        return new Response("Error", { status: 400 });
      }
      return new Response("OK");
    },
    port: 3001,
  });
}

async function serveStatic(request: Request) {
  const path = new URL(request.url).pathname;
  const file = Bun.file(paths.staticPath + path);
  if (!(await file.exists())) return null;
  return new Response(file);
}

function serveScript(request: Request) {
  const path = new URL(request.url).pathname;
  if (names.loadScriptPath != path) return null;
  const _scriptsStr = getScriptsList().map((sc) => {
    const variable = `__${generateRandomString(5)}__`;
    return `const ${variable} = ${sc}; ${variable}();`;
  });
  return new Response(_scriptsStr.join("\n"));
}

export class middleWare {
  public _session: webToken<any>;
  public _sessionData?: { [key: string]: any };
  public _deleteSesion = false;
  private request: Request;

  constructor({ req }: { req: Request }) {
    this.request = req;
    this._session = new webToken<unknown>(req, {
      cookieName: "bunext_session_token",
    });
  }

  setSessionData(data: { [key: string]: any }) {
    this._sessionData = data;
  }

  setSessionToken(response: Response) {
    if (this._sessionData) {
      return this._session.setCookie(response, {
        expire: 3600,
        httpOnly: true,
        secure: false,
      });
    } else if (this._deleteSesion) {
      return this._session.setCookie(response, {
        expire: -10000,
        httpOnly: true,
        secure: false,
      });
    }
    return response;
  }

  getSessionData<_Data>() {
    return this._session.session() as _Data | undefined;
  }
}
