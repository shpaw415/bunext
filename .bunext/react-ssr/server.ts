import { builder } from "@bunpmjs/bunext/internal/build";
import { router } from "./routes";
import { Shell } from "./shell";
import "./global";
import { names, paths } from "@bunpmjs/bunext/globals";
import { generateRandomString } from "@bunpmjs/bunext/features/utils";
import { ClientsetHotServer } from "@bunpmjs/bunext/dev/dev";
import "@bunpmjs/bunext/server_global";
import { renderToReadableStream } from "react-dom/server";
import { ErrorFallback } from "@bunpmjs/bunext/componants/fallback";
import { doWatchBuild } from "@bunpmjs/bunext/internal/build-watch";
import { Build } from "@bunpmjs/bunext/bin";
await init();

function RunServer() {
  try {
    const server = Bun.serve({
      port: 3000,
      async fetch(request) {
        // header probable memory leak
        const _MiddleWaremodule = await import(
          "@bunpmjs/bunext/internal/middleware"
        );
        request.headers.toJSON(); // <---- inhibit the problem for some reason
        _MiddleWaremodule.setMiddleWare(request); // <---- the error occure when the request is passed to this function
        const response =
          (await serve(request)) || // <----- or this function
          (await serveStatic(request)) ||
          serveScript(request);

        if (response) return _MiddleWaremodule.Session.setToken(response);

        globalThis.dryRun = false;
        return new Response("Not found", {
          status: 404,
        });
      },
    });
    console.log("Serve on port:", server.port);
  } catch (e) {
    console.log(e);
  }
}
async function init() {
  if (globalThis.mode === "dev" && globalThis.dryRun) {
    serveHotServer();
    ClientsetHotServer();
  }
  if (globalThis.dryRun) {
    setGlobalThis();
    RunServer();
    doWatchBuild();
  }
  globalThis.dryRun = false;
}

function setGlobalThis() {
  globalThis.__HEAD_DATA__ = JSON.parse(process.env.__HEAD_DATA__ as string);
}

async function serve(request: Request) {
  try {
    const route = router.server.match(request);
    if (route && globalThis.mode === "dev") {
      builder.resetPath(route.pathname);
      Build();
    }

    const response = await router.serve(request, {
      Shell: Shell as any,
      bootstrapModules: ["/.bunext/react-ssr/hydrate.js", "/bunext-scripts"],
      preloadScript: {
        __HEAD_DATA__: process.env.__HEAD_DATA__ as string,
      },
    });
    return response;
  } catch (e) {
    console.log((e as Error).name);
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
  const clearSocket = () => {
    globalThis.socketList = globalThis.socketList.filter(
      (s) => s.readyState == 0 || s.readyState == 1
    );
  };

  Bun.serve({
    websocket: {
      message: (ws, message) => {},
      open(ws) {
        ws.send("welcome");
        socketList.push(ws);
        clearSocket();
      },
      close(ws) {
        globalThis.socketList.splice(
          socketList.findIndex((s) => s == ws),
          1
        );
        clearSocket();
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

  setInterval(() => {
    clearSocket();
  }, 10000);
}

async function serveStatic(request: Request) {
  const path = new URL(request.url).pathname;
  const file = Bun.file(paths.staticPath + path);
  if (!(await file.exists())) return null;
  return new Response(file);
}

function serveScript(request: Request) {
  globalThis.scriptsList ??= [];
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
