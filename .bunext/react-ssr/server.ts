import { builder, doBuild } from "@bunpmjs/bunext/features/build";
import { router } from "./routes";
import { Shell } from "./shell";
import "./global";
import { names, paths } from "@bunpmjs/bunext/globals";
import { generateRandomString } from "@bunpmjs/bunext/features/utils";
import { ClientsetHotServer, sendSignal } from "@bunpmjs/bunext/dev/dev";
import { webToken } from "@bunpmjs/bunext";
import "@bunpmjs/bunext/server_global";
import { renderToReadableStream } from "react-dom/server";
import { ErrorFallback } from "./fallback";

await init();

try {
  const server = Bun.serve({
    port: 3000,
    async fetch(request) {
      const controller = new middleWare({ req: request });
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
globalThis.dryRun = false;

async function init() {
  if (globalThis.mode === "dev" && globalThis.dryRun) {
    serveHotServer();
    ClientsetHotServer();
  }
  if (globalThis.dryRun) await doBuild();
  sendSignal();
}

async function serve(request: Request, controller: middleWare) {
  try {
    const route = router.server.match(request);
    if (route && globalThis.mode === "dev") {
      await builder.buildPath(route.pathname);
      router.updateRoute(route.pathname);
    }
    const response = await router.serve(request, {
      Shell: Shell,
      bootstrapModules: ["/.bunext/react-ssr/hydrate.js", "/bunext-scripts"],
    });
    return response;
  } catch (e) {
    const res = async () =>
      new Response(
        await renderToReadableStream(ErrorFallback(), {
          bootstrapModules: ["/bunext-scripts"],
        })
      );
    return res();
  }
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
  const _scriptsStr = globalThis.scriptsList.map((sc) => {
    const variable = `__${generateRandomString(5)}__`;
    return `const ${variable} = ${sc}; ${variable}();`;
  });
  return new Response(_scriptsStr.join("\n"), {
    headers: {
      "Content-Type": "text/javascript;charset=utf-8",
    },
  });
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