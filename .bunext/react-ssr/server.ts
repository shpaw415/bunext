import { builder } from "@bunpmjs/bunext/internal/build";
import { doPreBuild, resetRouter, router } from "./routes";
import { Shell } from "./shell";
import "./global";
import { exitCodes, names, paths } from "@bunpmjs/bunext/internal/globals";
import { generateRandomString } from "@bunpmjs/bunext/features/utils";
import "@bunpmjs/bunext/internal/server_global";
import { renderToString } from "react-dom/server";
import { ErrorFallback } from "@bunpmjs/bunext/componants/fallback";
import { doWatchBuild, doBuild } from "@bunpmjs/bunext/internal/build-watch";
import { serveHotServer } from "@bunpmjs/bunext/dev/hotServer";
import { __REQUEST_CONTEXT__ } from "@bunpmjs/bunext/features/request";

const arg = process.argv[3] as undefined | "showError";
globalThis.dev.clientOnly = Boolean(process.argv[4]);

globalThis.devConsole.error = undefined;

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
            process.exit(exitCodes.runtime);
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
    RunServer();
    doWatchBuild(arg == "showError" ? true : false);
  }
  resetRouter();
  logDevConsole();
  globalThis.dryRun = false;
}

function logDevConsole(noClear?: boolean) {
  noClear ?? console.clear();
  const dev = globalThis.devConsole;
  const toLog = [
    `Serving: http://${dev.hostName}:${dev.servePort}`,
    `current Error: ${dev.error || "none"}`,
  ];

  toLog.forEach((c) => console.log(c));
  if (dev.message) console.log("Log:", dev.message);
  else console.log("Log: None");
}

async function serve(request: Request) {
  try {
    const route = router.server.match(request);
    const isDev = globalThis.mode == "dev";
    let pass = !isDev;
    if (route && isDev) {
      await doPreBuild(route.filePath);
      builder.resetPath(route.filePath);
      pass = await doBuild();
    }
    if (isDev && !pass) pass = await doBuild();

    const session = await import("@bunpmjs/bunext/features/session");
    let response: Response | null = null;
    if (pass)
      response = await router.serve(
        request,
        __REQUEST_CONTEXT__.response as Response,
        {
          Shell: Shell as any,
          bootstrapModules: [
            "/.bunext/react-ssr/hydrate.js",
            "/bunext-scripts",
          ],
          preloadScript: {
            __HEAD_DATA__: process.env.__HEAD_DATA__ as string,
            __PUBLIC_SESSION_DATA__: JSON.stringify(
              session.__GET_PUBLIC_SESSION_DATA__() ?? {}
            ),
          },
        }
      );
    else {
      devConsole.error = "build error";
    }
    logDevConsole();
    return response;
  } catch (e) {
    const res = async (error: Error) =>
      new Response(renderToString(ErrorFallback(error)), {
        headers: {
          "Content-Type": "text/html",
        },
      });
    if ((e as Error).name == "TypeError") process.exit(exitCodes.runtime);
    logDevConsole();
    return res(e);
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
