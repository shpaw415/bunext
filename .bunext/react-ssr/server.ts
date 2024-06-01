import { builder, makeBuild } from "@bunpmjs/bunext/internal/build";
import { router } from "./routes";
import { Shell } from "./shell";
import "./global";
import { exitCodes, names, paths } from "@bunpmjs/bunext/internal/globals";
import { generateRandomString } from "@bunpmjs/bunext/features/utils";
import "@bunpmjs/bunext/internal/server_global";
import { renderToString } from "react-dom/server";
import { ErrorFallback } from "@bunpmjs/bunext/componants/fallback";
import { doWatchBuild } from "@bunpmjs/bunext/internal/build-watch";
import { serveHotServer } from "@bunpmjs/bunext/dev/hotServer";
import { __REQUEST_CONTEXT__ } from "@bunpmjs/bunext/features/request";
import { revalidate } from "@bunpmjs/bunext/features/router";
import ServerConfig from "../../config/server";

const arg = process.argv[3] as undefined | "showError";
globalThis.dev.clientOnly = Boolean(process.argv[4]);

globalThis.devConsole.error = undefined;

await init();

function RunServer() {
  const server = Bun.serve({
    port: ServerConfig.HTTPServer.port,
    async fetch(request) {
      //console.clear();
      const _MiddleWaremodule = await import(
        "@bunpmjs/bunext/internal/middleware"
      );

      request.headers.toJSON();
      _MiddleWaremodule.setMiddleWare(request);

      const OnRequestResponse = await (
        await import("../../config/onRequest")
      ).default(request);
      if (OnRequestResponse) return OnRequestResponse;

      if (request.url.endsWith("/bunextgetSessionData")) {
        return new Response(
          JSON.stringify(_MiddleWaremodule.Session.getData()?.public)
        );
      }
      try {
        const response =
          (await serve(request)) ||
          (await serveStatic(request)) ||
          serveScript(request);
        if (response) return _MiddleWaremodule.Session.setToken(response);
      } catch (e) {
        if ((e as Error).name == "TypeError") {
          console.log(e);
        }
      }
      globalThis.dryRun = false;
      return new Response("Not found", {
        status: 404,
      });
    },
  });
  globalThis.devConsole.servePort = server.port;
}
async function init() {
  if (globalThis.dryRun) {
    await require("../../config/preload.ts");
    RunServer();
    logDevConsole();
  }
  if (process.env.NODE_ENV == "development" && globalThis.dryRun) {
    serveHotServer(ServerConfig.Dev.hotServerPort);
    doWatchBuild(arg == "showError" ? true : false);
  } else if (process.env.NODE_ENV == "production") {
    setRevalidate((await makeBuild()).revalidates);
  }

  globalThis.dryRun = false;
}

function logDevConsole(noClear?: boolean) {
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
  let serverActionData: FormData = new FormData();
  if (request.url.endsWith("/ServerActionGetter")) {
    serverActionData = await request.formData();
  }

  try {
    const isDev = process.env.NODE_ENV == "development";
    if (!router) throw new Error("reset router failed");
    const filepath = router.server?.match(request)?.filePath;
    if (request.url.includes("index.js?") && isDev) {
      const url = new URL(request.url);
      const pathname = url.pathname
        .split("/")
        .slice(0, -1)
        .join("/")
        .replace(builder.options.pageDir as string, "");
      const devRoute = router.server?.match(pathname);
      if (devRoute) {
        builder.resetPath(devRoute.filePath);
        await makeBuild();
      }
    } else if (isDev && filepath) {
      builder.resetPath(filepath);
      await makeBuild();
    }

    const session = await import("@bunpmjs/bunext/features/session");
    let response: Response | null = null;
    response = await router.serve(
      request,
      request.headers.toJSON(),
      __REQUEST_CONTEXT__.response as Response,
      serverActionData,
      {
        Shell: Shell as any,
        bootstrapModules: ["/.bunext/react-ssr/hydrate.js", "/bunext-scripts"],
        preloadScript: {
          __HEAD_DATA__: process.env.__HEAD_DATA__ as string,
          __PUBLIC_SESSION_DATA__: "undefined",
          __NODE_ENV__: `"${process.env.NODE_ENV}"`,
        },
      }
    );
    return response;
  } catch (e) {
    const res = async (error: Error) =>
      new Response(renderToString(ErrorFallback(error)), {
        headers: {
          "Content-Type": "text/html",
        },
      });
    if ((e as Error).name == "TypeError") {
      console.log(e);
    }
    return res(e as Error);
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

function setRevalidate(
  revalidates: {
    path: string;
    time: number;
  }[]
) {
  for (const reval of revalidates) {
    setInterval(async () => {
      await revalidate(reval.path);
    }, reval.time);
  }
}
