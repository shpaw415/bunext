import { webToken } from "@bunpmjs/json-webtoken";
import { doBuild } from "./build";
import { router } from "./routes";
import { Shell } from "./shell";
import type { Server, ServerWebSocket } from "bun";
import "./global";
import { names, paths } from "@bunpmjs/bunext/globals";
declare global {
  var bunext_Session: webToken<any>;
  var bunext_SessionData: { [key: string]: any } | undefined;
  var bunext_SessionDelete: boolean;
  var hotServer: Server;
  var socketList: ServerWebSocket<unknown>[];
}

globalThis.bunext_SessionDelete ??= false;
globalThis.socketList ??= [];

await doBuild();

try {
  const server = Bun.serve({
    port: 3000,
    async fetch(request) {
      initSession(request);

      if (!request.url.endsWith(".js")) await doBuild();
      const response =
        (await serve(request)) ||
        (await serveStatic(request)) ||
        serveScript(request);
      if (response) return setSessionToken(response as Response);
      return new Response("Not found", {
        status: 404,
      });
    },
  });
  const hotServer = Bun.serve({
    fetch(req, server) {
      if (server.upgrade(req)) {
        return; // do not return a Response
      }
      return new Response("Upgrade failed :(", { status: 500 });
    },
    websocket: {
      open(ws) {
        globalThis.socketList.push(ws);
      },
      message(ws, message) {},
    },
    port: 3001,
  });
  console.log("Serve on port:", server.port);
} catch (e) {
  console.log(e);
  process.exit(0);
}

function serve(request: Request) {
  return router.serve(request, {
    Shell: Shell,
    bootstrapModules: [".bunext/react-ssr/hydrate.js"],
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
  return new Response(
    `eval(${globalThis.scriptsList.map((sc) => `${sc}`).join("\n")})`
  );
}

function initSession(request: Request) {
  globalThis.bunext_Session = new webToken(request, {
    cookieName: "bunext_session_token",
  });
}

function setSessionToken(response: Response) {
  if (globalThis.bunext_SessionData) {
    return globalThis.bunext_Session.setCookie(response, {
      expire: 3600,
      httpOnly: true,
      secure: false,
    });
  } else if (globalThis.bunext_SessionDelete) {
    return globalThis.bunext_Session.setCookie(response, {
      expire: -10000,
      httpOnly: true,
      secure: false,
    });
  }
  return response;
}
