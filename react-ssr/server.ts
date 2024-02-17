import { webToken } from "@bunpmjs/json-webtoken";
import { doBuild } from "./build";
import { router } from "./routes";
import { Shell } from "./shell";
import type { Server, ServerWebSocket } from "bun";
import "./global";
import { names, paths } from "@bunpmjs/bunext/globals";
import { generateRandomString } from "@bunpmjs/bunext/features/utils";
import { resetScript } from "@bunpmjs/bunext/componants/script";
import { ClientsetHotServer } from "@bunpmjs/bunext/dev/dev";

declare global {
  var bunext_Session: webToken<any>;
  var bunext_SessionData: { [key: string]: any } | undefined;
  var bunext_SessionDelete: boolean;
  var hotServer: Server;
  var socketList: ServerWebSocket<unknown>[];
}

globalThis.bunext_SessionDelete = false;
globalThis.socketList ??= [];

await doBuild();

try {
  const server = Bun.serve({
    port: 3000,
    async fetch(request) {
      initSession(request);
      resetScript();
      globalThis.mode === "dev" && ClientsetHotServer();

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
  Bun.serve({
    websocket: {
      open: (ws) => {
        console.log("Client connected");
      },
      message: (ws, message) => {
        console.log("Client sent message", message);
      },
      close: (ws) => {
        console.log("Client disconnected");
      },
    },
    fetch(req, server) {
      const upgraded = server.upgrade(req);
      if (!upgraded) {
        return new Response("Upgrade failed", { status: 400 });
      }
      return new Response("Hello World");
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
  const _scriptsStr = globalThis.scriptsList.map((sc) => {
    const variable = `__${generateRandomString(5)}__`;
    return `const ${variable} = ${sc}; ${variable}();`;
  });
  return new Response(_scriptsStr.join("\n"));
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
