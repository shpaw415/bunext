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

import _ServerConfig from "../../config/server"; // must be relative
import Bypassrequest from "../../config/onRequest";
import type { Server as _Server } from "bun";
import { BunextRequest } from "@bunpmjs/bunext/internal/bunextRequest";

import { cpus, type as OSType } from "node:os";
import cluster from "node:cluster";
import type { ssrElement } from "@bunpmjs/bunext/internal/types";
import { revalidate } from "@bunpmjs/bunext/features/router";
import {
  CleanExpiredSession,
  DeleteSessionByID,
  GetSessionByID,
  InitDatabase,
  SetSessionByID,
} from "@bunpmjs/bunext/internal/session";
import type { ClusterMessageType } from "@bunpmjs/bunext/internal/types";

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      bun_worker?: string;
    }
  }
}
globalThis.serverConfig ??= _ServerConfig;
globalThis.clusterStatus ??= false;

class BunextServer {
  port = globalThis.serverConfig.HTTPServer.port || 3000;
  server?: _Server;
  hotServerPort = globalThis.serverConfig.Dev.hotServerPort || 3001;
  hotServer?: _Server;
  hostName = "localhost";
  isClustered = false;
  waittingBuildFinish: Promise<boolean> | undefined;
  WaitingBuildFinishResolver:
    | ((value: boolean | PromiseLike<boolean>) => void)
    | undefined;

  constantLog = [`Serving: http://${this.hostName}:${this.port}`];

  RunServer() {
    const self = this;
    this.server = Bun.serve({
      port: this.port,
      async fetch(request) {
        request.headers.toJSON();

        const OnRequestResponse = await Bypassrequest(request);
        if (OnRequestResponse) return OnRequestResponse;

        try {
          const response = await self.serve(request);
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

  async SessionDatabaseIniter() {
    const sessionConfigType = globalThis.serverConfig.session?.type;
    const setClearSessionInterval = () =>
      setInterval(() => CleanExpiredSession(), 1800 * 1000);

    switch (sessionConfigType) {
      case "database:hard":
        await InitDatabase();
        setClearSessionInterval();
        break;
      case "database:memory":
        if (cluster.isWorker) break;
        await InitDatabase();
        setClearSessionInterval();
        break;
    }
  }

  async init() {
    const isDev = process.env.NODE_ENV == "development";
    const isDryRun = globalThis.dryRun;
    const isMainThread = cluster.isPrimary;

    if (isDryRun) {
      globalThis.clusterStatus = this.MakeCluster();
      await this.SessionDatabaseIniter();
    }

    if (!globalThis.clusterStatus) {
      if (isDryRun) {
        if (isDev) {
          doWatchBuild();
          this.serveHotServer(globalThis.serverConfig.Dev.hotServerPort);
          await builder.makeBuild();
        } else {
          const buildoutput = await builder.makeBuild();
          if (!buildoutput) throw new Error("Production build failed");
          setRevalidate(buildoutput.revalidates);
        }
        this.RunServer();
      }
      await router.InitServerActions();
    } else if (isMainThread) {
      if (isDryRun) {
        await require("../../config/preload.ts");
        if (isDev) {
          doWatchBuild();
          this.serveHotServer(globalThis.serverConfig.Dev.hotServerPort);
          await builder.makeBuild();
        } else {
          const buildoutput = await builder.makeBuild();
          if (!buildoutput) throw new Error("Production build failed");
          this.updateWorkerData();
          setRevalidate(buildoutput.revalidates);
        }
      }
    } else if (!isMainThread) {
      if (isDryRun) this.RunServer();
      await router.InitServerActions();
    }

    if (isDryRun) globalThis.dryRun = false;

    this.logDevConsole(
      this.isClustered && !isDev
        ? "Starting Bunext in Multi-threaded mode"
        : undefined
    );

    return this;
  }

  logDevConsole(log?: any) {
    if (
      typeof process.env.bun_worker != "undefined" &&
      process.env.bun_worker != "1"
    )
      return;
    console.log(this.constantLog.join("\n"));
    if (log) console.log(log);
  }

  private async checkBuildOnDevMode({
    url,
    header,
    filePath,
  }: {
    url: URL;
    header: Record<string, string>;
    filePath?: string;
  }) {
    const isDev = process.env.NODE_ENV == "development";

    if (!isDev) return;

    if (
      header.accept == "application/vnd.server-side-props" ||
      header.accept.startsWith("text/html")
    ) {
      if (this.isClustered)
        await this.updateWorkerData({
          path: filePath,
        });
      else {
        this.makeBuildAwaiter();
        if (filePath) builder.resetPath(filePath);
        await builder.makeBuild();
      }
    } else if (url.pathname.endsWith(".js") && url.search.startsWith("?"))
      await this.waittingBuildFinish;
  }

  async serve(request: Request) {
    let serverActionData: FormData = new FormData();
    const JSONHeader = request.headers.toJSON();
    if (request.url.endsWith("/ServerActionGetter")) {
      serverActionData = await request.formData();
    }
    try {
      await this.checkBuildOnDevMode({
        url: new URL(request.url),
        filePath: router.server?.match(request)?.filePath,
        header: JSONHeader,
      });
      let response: BunextRequest | null = await router.serve(
        request,
        JSONHeader,
        serverActionData,
        {
          Shell: Shell as any,
        }
      );

      return response;
    } catch (e) {
      console.log(e);
      const res = async (error: Error) =>
        new Response(renderToString(ErrorFallback(error)), {
          headers: {
            "Content-Type": "text/html",
          },
          status: 500,
        });
      if ((e as Error).name == "TypeError") process.exit(1);
      return res(e as Error);
    }
  }

  MakeCluster() {
    if (
      OSType() != "Linux" ||
      !Bun.semver.satisfies(Bun.version, "^1.1.25") ||
      process.env.NODE_ENV == "development"
    )
      return false;

    this.isClustered = true;

    if (cluster.isWorker) {
      process.on("message", (data) => {
        if (typeof (data as any).task != "undefined") return;
        builder.ssrElement = data as ssrElement[];
        if (this.WaitingBuildFinishResolver)
          this.WaitingBuildFinishResolver(true);
      });
      return true;
    }

    const cpuCoreCount = cpus().length;

    let count =
      globalThis.serverConfig.HTTPServer.threads == "all_cpu_core"
        ? cpuCoreCount
        : globalThis.serverConfig.HTTPServer.threads || 1;

    if (count <= 1 || process.env.NODE_ENV == "development") count = 1;

    if (count > cpuCoreCount) {
      console.error(
        `Server Config\nAvalable Core: ${cpuCoreCount}\nServerConfig: ${count}`
      );
      count = cpuCoreCount;
    }

    for (let i = 0; i < count; i++)
      cluster.fork({
        bun_worker: i.toString(),
      });

    cluster.on("message", async (w, _message) => {
      const message = _message as ClusterMessageType;
      switch (message.task) {
        case "revalidate":
          revalidate(message.data.path);
          break;
        case "udpate_build":
          if (message.data.path) builder.resetPath(message.data.path);
          await builder.makeBuild();
          await this.updateWorkerData();
          break;
        case "getSession":
          w.send({
            data: {
              data: GetSessionByID(message.data.id) || false,
              id: message.data.id,
            },
            task: "getSession",
          } as ClusterMessageType);
          break;
        case "setSession":
          SetSessionByID(
            message.data.type,
            message.data.id,
            message.data.sessionData
          );
          break;
        case "deleteSession":
          DeleteSessionByID(message.data.id);
          break;
      }
    });

    return true;
  }
  private makeBuildAwaiter() {
    this.waittingBuildFinish = new Promise((res) => {
      this.WaitingBuildFinishResolver = res;
    });
  }
  async updateWorkerData(data?: { path?: string }) {
    if (!this.isClustered) {
      this.WaitingBuildFinishResolver?.(true);
      return;
    }

    if (!cluster.isPrimary) {
      this.makeBuildAwaiter();
      process.send?.({
        task: "udpate_build",
        data: {
          path: data?.path,
        },
      } as ClusterMessageType);
      await this.waittingBuildFinish;
    } else {
      for (const worker of Object.values(cluster.workers || [])) {
        worker?.send(builder.ssrElement);
      }
    }
  }
}

if (!globalThis.Server || process.env.NODE_ENV == "production") {
  (globalThis as any).Server = await new BunextServer().init();
} else await globalThis.Server.init();
export { BunextServer };
