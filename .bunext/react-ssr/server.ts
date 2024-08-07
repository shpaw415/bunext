import "@bunpmjs/bunext/internal/globals";
import "@bunpmjs/bunext/internal/server_global";

import { builder } from "@bunpmjs/bunext/internal/build";
import { router } from "@bunpmjs/bunext/internal/router";
import { Shell } from "./shell";
import { renderToString } from "react-dom/server";
import { ErrorFallback } from "@bunpmjs/bunext/componants/fallback";
import { doWatchBuild } from "@bunpmjs/bunext/internal/build-watch";
import {
  setRevalidate,
  serveScript,
  serveStatic,
} from "@bunpmjs/bunext/internal/server-features";

import ServerConfig from "../../config/server"; // must be relative
import type { Server as _Server } from "bun";
import { BunextRequest } from "@bunpmjs/bunext/internal/bunextRequest";

class BunextServer {
  port = ServerConfig.HTTPServer.port || 3000;
  server?: _Server;
  hotServerPort = ServerConfig.Dev.hotServerPort || 3001;
  hotServer?: _Server;
  hostName = "localhost";

  RunServer() {
    const self = this;
    this.server = Bun.serve({
      port: this.port,
      async fetch(request) {
        request.headers.toJSON();

        const OnRequestResponse = await (
          await import("../../config/onRequest")
        ).default(request);
        if (OnRequestResponse) return OnRequestResponse;

        try {
          const response =
            (await self.serve(request)) ||
            (await serveStatic(request)) ||
            serveScript(request);
          if (response instanceof Response) return response;
          else if (response instanceof BunextRequest) return response.response;
        } catch (e) {
          console.log(e);
        }
        return new Response("Not found!!", {
          status: 404,
        });
      },
    });
  }

  serveHotServer(port: number) {
    this.hotServerPort = port;
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
    const isDev = process.env.NODE_ENV == "development";
    if (globalThis.dryRun) {
      globalThis.serverConfig = ServerConfig;
      await require("../../config/preload.ts");
      this.RunServer();
      this.logDevConsole();
    }
    if (isDev) {
      await router.InitServerActions();
    }

    if (isDev && globalThis.dryRun) {
      this.serveHotServer(ServerConfig.Dev.hotServerPort);
      await builder.preBuildAll();
      await builder.makeBuild();
    } else if (process.env.NODE_ENV == "production") {
      const buildoutput = await builder.makeBuild();
      if (!buildoutput) throw new Error("Production build failed");
      setRevalidate(buildoutput.revalidates);
      await router.InitServerActions();
    }

    if (globalThis.dryRun) {
      globalThis.dryRun = false;
      if (isDev) doWatchBuild();
    }
    return this;
  }

  logDevConsole() {
    const toLog = [`Serving: http://${this.hostName}:${this.port}`];
    console.log(toLog.join("\n"));
  }

  async serve(request: Request) {
    let serverActionData: FormData = new FormData();
    if (request.url.endsWith("/ServerActionGetter")) {
      serverActionData = await request.formData();
    }

    try {
      const isDev = process.env.NODE_ENV == "development";
      const filepath = router.server?.match(request)?.filePath;
      const urlData = new URL(request.url);

      if (isDev) {
        if (filepath) {
          builder.resetPath(filepath);
          await builder.preBuild(filepath);
          await builder.makeBuild();
        } else if (
          !urlData.pathname.endsWith("index.js") &&
          !urlData.pathname.endsWith("].js")
        ) {
          ("pass");
        } else if (!urlData.search.startsWith("?")) {
          ("pass");
        } else {
          await builder.makeBuild();
        }
      }

      let response: BunextRequest | null = await router.serve(
        request,
        request.headers.toJSON(),
        serverActionData,
        {
          Shell: Shell as any,
        }
      );
      return response;
    } catch (e) {
      const res = async (error: Error) =>
        new Response(renderToString(ErrorFallback(error)), {
          headers: {
            "Content-Type": "text/html",
          },
          status: 500,
        });
      console.log(e);
      return res(e as Error);
    }
  }
}

const Server = await new BunextServer().init();

export { Server, BunextServer };
