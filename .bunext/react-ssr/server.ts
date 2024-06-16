import "@bunpmjs/bunext/internal/globals";
import "@bunpmjs/bunext/internal/server_global";

import { builder } from "@bunpmjs/bunext/internal/build";
import { router } from "@bunpmjs/bunext/internal/router";
import { Shell } from "./shell";
import { renderToString } from "react-dom/server";
import { ErrorFallback } from "@bunpmjs/bunext/componants/fallback";
import { doWatchBuild } from "@bunpmjs/bunext/internal/build-watch";
import { __REQUEST_CONTEXT__ } from "@bunpmjs/bunext/features/request";
import {
  setRevalidate,
  serveScript,
  serveStatic,
} from "@bunpmjs/bunext/internal/server-features";

import ServerConfig from "../../config/server"; // must be relative
import type { Server as _Server } from "bun";

const arg = process.argv[3] as undefined | "showError";

class BunextServer {
  port = ServerConfig.HTTPServer.port || 3000;
  server?: _Server;
  hotServerPort = ServerConfig.Dev.hotServerPort || 3001;
  hotServer?: _Server;

  RunServer() {
    const self = this;
    this.server = Bun.serve({
      port: this.port,
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
            (await self.serve(request)) ||
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
  }

  serveHotServer(port: number) {
    const clearSocket = () => {
      globalThis.socketList = globalThis.socketList.filter(
        (s) => s.readyState == 0 || s.readyState == 1
      );
    };

    this.hotServer = Bun.serve({
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
      port: port,
    });

    setInterval(() => {
      clearSocket();
    }, 10000);
  }

  async init() {
    if (globalThis.dryRun) {
      await require("../../config/preload.ts");
      this.RunServer();
      this.logDevConsole();
    }
    if (process.env.NODE_ENV == "development" && globalThis.dryRun) {
      this.serveHotServer(ServerConfig.Dev.hotServerPort);
      doWatchBuild(arg == "showError" ? true : false);
    } else if (process.env.NODE_ENV == "production") {
      const buildoutput = await builder.makeBuild();
      if (!buildoutput) throw new Error("Production build failed");
      setRevalidate(buildoutput.revalidates);
    }

    globalThis.dryRun = false;
    return this;
  }

  logDevConsole(noClear?: boolean) {
    if (
      typeof process.env.__TEST_MODE__ != "undefined" &&
      process.env.__TEST_MODE__ == "true"
    )
      return;
    const dev = globalThis.devConsole;
    const toLog = [
      `Serving: http://${dev.hostName}:${dev.servePort}`,
      `current Error: ${dev.error || "none"}`,
    ];

    toLog.forEach((c) => console.log(c));
    if (dev.message) console.log("Log:", dev.message);
    else console.log("Log: None");
  }

  async serve(request: Request) {
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
          await builder.makeBuild();
        }
      } else if (isDev && filepath) {
        builder.resetPath(filepath);
        await builder.makeBuild();
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
          bootstrapModules: [
            "/.bunext/react-ssr/hydrate.js",
            "/bunext-scripts",
          ],
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
}

const Server = await new BunextServer().init();

export { Server, BunextServer };
