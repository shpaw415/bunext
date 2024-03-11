import { builder } from "@bunpmjs/bunext/internal/build";
import { router } from "./routes";
import { Shell } from "./shell";
import "./global";
import { names, paths } from "@bunpmjs/bunext/globals";
import { generateRandomString } from "@bunpmjs/bunext/features/utils";
import "@bunpmjs/bunext/server_global";
import { renderToReadableStream } from "react-dom/server";
import { ErrorFallback } from "@bunpmjs/bunext/componants/fallback";
import { doWatchBuild } from "@bunpmjs/bunext/internal/build-watch";
import { Build } from "@bunpmjs/bunext/bin";
import { serveHotServer } from "@bunpmjs/bunext/dev/hotServer";
import { __REQUEST_CONTEXT__ } from "@bunpmjs/bunext/features/request";

interface devConsole {
  servePort: number;
  hostName: string;
  error?: string;
}

declare global {
  var devConsole: devConsole;
}

globalThis.devConsole ??= {
  servePort: 3000,
  hostName: "localhost",
};

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
        try {
          const response =
            (await serve(request)) || // <----- or this function
            (await serveStatic(request)) ||
            serveScript(request);
          if (response) return _MiddleWaremodule.Session.setToken(response);
        } catch (e) {
          if ((e as Error).name == "TypeError") {
            console.log("Runtime error... Reloading!");
            process.exit(101);
          }
          console.log(e);
        }
        globalThis.dryRun = false;
        return new Response("Not found", {
          status: 404,
        });
      },
    });
    globalThis.devConsole.servePort = server.port;
  } catch (e) {
    console.log(e);
    process.exit(0);
  }
}
async function init() {
  if (globalThis.mode === "dev" && globalThis.dryRun) {
    serveHotServer();
  }
  if (globalThis.dryRun) {
    setGlobalThis();
    RunServer();
    doWatchBuild();
  }
  logDevConsole();
  globalThis.dryRun = false;
}

function logDevConsole() {
  console.clear();
  const dev = globalThis.devConsole;
  const toLog = [
    `Serving: http://${dev.hostName}:${dev.servePort}`,
    `current Error: ${dev.error || "none"}`,
  ];

  toLog.forEach((c) => console.log(c));
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

    const session = await import("@bunpmjs/bunext/features/session");

    const response = await router.serve(
      __REQUEST_CONTEXT__.request as Request,
      __REQUEST_CONTEXT__.response as Response,
      {
        Shell: Shell as any,
        bootstrapModules: ["/.bunext/react-ssr/hydrate.js", "/bunext-scripts"],
        preloadScript: {
          __HEAD_DATA__: process.env.__HEAD_DATA__ as string,
          __PUBLIC_SESSION_DATA__: JSON.stringify(
            session.__GET_PUBLIC_SESSION_DATA__() ?? {}
          ),
        },
      }
    );
    return response;
  } catch (e) {
    const res = async () =>
      new Response(
        await renderToReadableStream(ErrorFallback(), {
          bootstrapModules: ["/bunext-scripts"],
        })
      );
    if ((e as Error).name == "TypeError") process.exit(101);
    return res();
  }
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
