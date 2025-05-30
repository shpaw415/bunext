import "../globals.ts";
import "./server_global.ts";

import { builder } from "./build.ts";
import { router } from "./router.tsx";
import { renderToString } from "react-dom/server";
import { ErrorFallback } from "../../components/fallback.tsx";
import { doWatchBuild } from "./build-watch.ts";
import { setRevalidate } from "./server-features.ts";

import type { Server as _Server } from "bun";
import { BunextRequest } from "./bunextRequest.ts";

import { cpus, type as OSType } from "node:os";
import cluster from "node:cluster";
import { revalidate } from "../../features/router/revalidate.ts";
import {
  CleanExpiredSession,
  DeleteSessionByID,
  GetSessionByID,
  InitDatabase,
  SetSessionByID,
} from "../session.ts";
import type {
  ClusterMessageType,
  OnRequestType,
  ReactShellComponent,
} from "../types.ts";
import OnServerStart, { OnServerStartCluster } from "./server-start.ts";
import "../caching/fetch.ts";
import {
  benchmark_console,
  DevConsole,
  TerminalIcon,
  TextColor,
  ToColor,
  getStartLog,
} from "./logs.ts";
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      bun_worker?: string;
    }
  }
}

globalThis.clusterStatus ??= false;

const excludesPathToNotLog = [
  "/src/pages",
  "/node_modules/react",
  "/.bunext",
  "/node_modules/scheduler",
  "/chunk-",
];

function StatusCodeToColor(statusCode: number) {
  if (statusCode >= 500) return "red";
  else if (statusCode >= 400) return "#333";
  else if (statusCode >= 300) return "yellow";
  else if (statusCode >= 200) return "green";
  return TextColor;
}

class BunextServer {
  onRequest?: OnRequestType;
  preloadModulePath: string;
  Shell: ReactShellComponent;

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

  constructor({
    onRequest,
    preloadModulePath,
    Shell,
  }: {
    onRequest?: OnRequestType;
    preloadModulePath: string;
    Shell: ReactShellComponent;
  }) {
    this.onRequest = onRequest;
    this.preloadModulePath = preloadModulePath;
    this.Shell = Shell;
  }

  RunServer() {
    const self = this;
    this.server = Bun.serve({
      port: this.port,
      ...(globalThis.serverConfig?.HTTPServer.config as any),
      async fetch(request) {
        const headerJSON = request.headers.toJSON();
        return benchmark_console(
          (time, result) => {
            const url = new URL(request.url);

            if (
              excludesPathToNotLog
                .map((path) => url.pathname.startsWith(path))
                .includes(true) ||
              headerJSON["accept"] == "application/vnd.server-side-props"
            )
              return undefined;
            return `${ToColor("green", TerminalIcon.success)} ${ToColor(
              TextColor,
              request.method.toUpperCase()
            )} ${ToColor(TextColor, url.pathname)} ${ToColor(
              StatusCodeToColor(result.status),
              result.status
            )} ${ToColor(TextColor, `in ${time}ms`)}`;
          },
          async () => {
            const res = await self.onRequest?.(request);
            if (res) return res;
            try {
              const response = await self.serve(request);
              if (response instanceof Response) return response;
              else if (response instanceof BunextRequest)
                return response.response;
            } catch (e) {
              console.log(e);
            }
            return new Response("Not found!!", {
              status: 404,
            });
          }
        );
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

    this.hotServer = Bun.serve<undefined, {}>({
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
    const dry = Boolean(globalThis.dryRun);
    process.env.NODE_ENV == "development" && console.clear();
    DevConsole(`${getStartLog()}`);
    dry &&
      DevConsole(
        `${ToColor("green", TerminalIcon.success)} ${ToColor(
          TextColor,
          "Starting..."
        )}`
      );
    return benchmark_console(
      (time) =>
        dry &&
        `${ToColor("green", TerminalIcon.success)} ${ToColor(
          TextColor,
          `Ready in ${time}ms`
        )}`,
      () => this._init()
    );
  }

  private async _init() {
    const isDev = process.env.NODE_ENV == "development";
    const isDryRun = globalThis.dryRun;
    const isMainThread = cluster.isPrimary;
    if (isDryRun) {
      globalThis.clusterStatus = this.MakeCluster();
      await this.SessionDatabaseIniter();
    }

    router.server?.reload();
    router.client?.reload();
    if (!globalThis.clusterStatus) {
      if (isMainThread) {
        await import(this.preloadModulePath);
      }
      if (isDryRun) {
        await OnServerStart();
        if (isDev) {
          doWatchBuild();
          this.serveHotServer(globalThis.serverConfig.Dev.hotServerPort);
        } else {
          const buildoutput = await builder.makeBuild();
          if (!buildoutput) {
            console.log(buildoutput);
            throw new Error("Production build failed");
          }
          setRevalidate(buildoutput.revalidates);
        }
        this.RunServer();
      }
      await router.InitServerActions();
    } else if (isMainThread) {
      if (isDryRun) {
        //@ts-ignore
        await import(this.preloadModulePath);
        await OnServerStart();
        if (isDev) {
          doWatchBuild();
          this.serveHotServer(globalThis.serverConfig.Dev.hotServerPort);
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
      await OnServerStartCluster();
    }

    if (isDryRun) globalThis.dryRun = false;

    if (this.isClustered && !isDev && isMainThread)
      console.log("Starting Bunext in Multi-threaded mode");

    return this;
  }

  private async checkBuildOnDevMode({ filePath }: { filePath?: string }) {
    if (this.isClustered && filePath)
      await this.updateWorkerData({
        path: filePath,
      });
  }

  async serve(request: Request) {
    let serverActionData: FormData = new FormData();
    const JSONHeader = request.headers.toJSON();
    if (request.url.endsWith("/ServerActionGetter")) {
      serverActionData = await request.formData();
    }
    try {
      await this.checkBuildOnDevMode({
        filePath: router.server?.match(request)?.filePath,
      });
      let response: BunextRequest | null = await router.serve(
        request,
        JSONHeader,
        serverActionData,
        {
          Shell: this.Shell,
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
      !Bun.semver.satisfies(Bun.version, "1.1.25 - x.x.x") ||
      process.env.NODE_ENV == "development" ||
      !serverConfig.HTTPServer?.threads ||
      (typeof serverConfig.HTTPServer?.threads == "number" &&
        serverConfig.HTTPServer?.threads <= 1)
    )
      return false;

    this.isClustered = true;

    if (cluster.isWorker) {
      process.on("message", (data) => {
        if (data == "build_done") return;
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
        `Server Config\nAvailable Core: ${cpuCoreCount}\nServerConfig: ${count}`
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
          revalidate(...message.data.path);
          break;
        case "update_build":
          if (message.data.path) await builder.resetPath(message.data.path);
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
        task: "update_build",
        data: {
          path: data?.path,
        },
      } as ClusterMessageType);
    } else {
      for (const worker of Object.values(cluster.workers || [])) {
        worker?.send("build_done");
      }
    }
  }
}

export { BunextServer };
