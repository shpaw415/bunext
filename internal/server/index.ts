import "../globals.ts";
import "./server_global.ts";

// Build and routing
import { builder } from "./build.ts";
import { router } from "./router.tsx";
import { doWatchBuild } from "./build-watch.ts";
import { setRevalidate } from "./server-features.ts";

// React and error handling
import { renderToString } from "react-dom/server";
import { ErrorFallback } from "../../components/fallback.tsx";

// Bun and request handling
import type { Server as _Server } from "bun";
import { BunextRequest } from "./bunextRequest.ts";

// Node.js modules
import { cpus, type as OSType } from "node:os";
import cluster from "node:cluster";

// Features
import { revalidate } from "../../features/router/revalidate.ts";
import {
  CleanExpiredSession,
  DeleteSessionByID,
  GetSessionByID,
  InitDatabase,
  SetSessionByID,
} from "../session.ts";

// Types and server startup
import type {
  ClusterMessageType,
  OnRequestType,
  ReactShellComponent,
} from "../types.ts";
import OnServerStart, { OnServerStartCluster } from "./server-start.ts";

// Caching and logging
import "../caching/fetch.ts";
import {
  benchmark_console,
  DevConsole,
  TerminalIcon,
  TextColor,
  ToColor,
  getStartLog,
} from "./logs.ts";
import { DevWsMessageHandler, type DevWsMessageTypes } from "../../dev/hotServer.ts";
import { exit } from "node:process";
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      bun_worker?: string;
    }
  }
}

// Global initialization
globalThis.clusterStatus ??= false;

// Constants
const EXCLUDED_PATHS_FROM_LOGGING = [
  "/src/pages",
  "/node_modules/react",
  "/.bunext",
  "/node_modules/scheduler",
  "/chunk-",
] as const;

const SESSION_CLEANUP_INTERVAL = 1800 * 1000; // 30 minutes
const SOCKET_CLEANUP_INTERVAL = 10000; // 10 seconds

// Utility functions
function getStatusCodeColor(statusCode: number): string {
  if (statusCode >= 500) return "red";
  if (statusCode >= 400) return "#333";
  if (statusCode >= 300) return "yellow";
  if (statusCode >= 200) return "green";
  return TextColor;
}

function shouldLogRequest(url: URL, headers: Record<string, string>): boolean {
  const isExcludedPath = EXCLUDED_PATHS_FROM_LOGGING.some(path =>
    url.pathname.startsWith(path)
  );
  const isServerSideProps = headers["accept"] === "application/vnd.server-side-props";

  return !isExcludedPath && !isServerSideProps;
}

function createRequestLogMessage(
  request: Request,
  result: Response,
  time: number
): string {
  const url = new URL(request.url);
  return [
    ToColor("green", TerminalIcon.success),
    ToColor(TextColor, request.method.toUpperCase()),
    ToColor(TextColor, url.pathname),
    ToColor(getStatusCodeColor(result.status), result.status),
    ToColor(TextColor, `in ${time}ms`)
  ].join(" ");
}

class BunextServer {
  public onRequest?: OnRequestType;
  public preloadModulePath: string;
  public Shell: ReactShellComponent;

  public port = globalThis.serverConfig.HTTPServer.port || 3000;
  public server?: _Server;
  public hotServerPort = globalThis.serverConfig.Dev.hotServerPort || 3001;
  public hotServer?: _Server;
  public hostName = "localhost";
  public isClustered = false;

  public waittingBuildFinish: Promise<boolean> | undefined;
  public WaitingBuildFinishResolver:
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

  startServer() {
    this.server = Bun.serve({
      port: this.port,
      ...(globalThis.serverConfig?.HTTPServer.config as any),
      fetch: this.createFetchHandler(),
    });
  }

  Reboot() {
    DevConsole(
      `${ToColor("blue", TerminalIcon.info)} ${ToColor(
        TextColor,
        "Rebooting server..."
      )}`
    );
    exit(0);
  }

  private createFetchHandler() {
    return async (request: Request) => {
      const headers = request.headers.toJSON();
      return benchmark_console(
        (time, result) => {
          const url = new URL(request.url);

          if (shouldLogRequest(url, headers)) {
            return createRequestLogMessage(request, result, time);
          }
          return undefined;
        },
        async () => {
          const customResponse = await this.onRequest?.(request);
          if (customResponse) return customResponse;

          try {
            const response = await this.serve(request);
            if (response instanceof Response) return response;
            if (response instanceof BunextRequest) return response.response;
          } catch (error) {
            console.error(error);
          }

          return new Response("Not found!!", { status: 404 });
        }
      );
    };
  }

  serveHotServer(port: number) {
    this.hotServerPort = port;

    const clearInactiveSockets = () => {
      globalThis.socketList = globalThis.socketList.filter(
        (socket) => socket.readyState === 0 || socket.readyState === 1
      );
    };

    this.hotServer = Bun.serve<undefined, {}>({
      websocket: {
        message: (ws, message) => {
          DevWsMessageHandler.forEach((handler) => {
            if (typeof message === "string") {
              const parsedData = JSON.parse(message) as { type: DevWsMessageTypes, data: any };
              handler(parsedData.type, parsedData.data, ws);
            } else {
              console.warn("Received non-string message in WebSocket:");
            }
          });
        },
        open(ws) {
          ws.send("welcome");
          socketList.push(ws);
          clearInactiveSockets();
        },
        close(ws) {
          const socketIndex = socketList.findIndex((s) => s === ws);
          if (socketIndex !== -1) {
            globalThis.socketList.splice(socketIndex, 1);
          }
          clearInactiveSockets();
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

    // Clean up inactive sockets periodically
    setInterval(clearInactiveSockets, SOCKET_CLEANUP_INTERVAL);
  }

  async initSessionDatabase() {
    const sessionConfigType = globalThis.serverConfig.session?.type;
    const setClearSessionInterval = () =>
      setInterval(() => CleanExpiredSession(), SESSION_CLEANUP_INTERVAL);

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
      globalThis.clusterStatus = this.createCluster();
      await this.initSessionDatabase();
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
        this.startServer();
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
      if (isDryRun) this.startServer();
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

  async serve(request: Request): Promise<Response | BunextRequest | null> {
    let serverActionData: FormData = new FormData();
    const headers = request.headers.toJSON();

    if (request.url.endsWith("/ServerActionGetter")) {
      serverActionData = await request.formData();
    }

    try {
      await this.checkBuildOnDevMode({
        filePath: router.server?.match(request)?.filePath,
      });

      const response = await router.serve(
        request,
        headers,
        serverActionData,
        {
          Shell: this.Shell,
        }
      );

      return response;
    } catch (error) {
      console.error(error);

      if ((error as Error).name === "TypeError") {
        process.exit(1);
      }

      return this.createErrorResponse(error as Error);
    }
  }

  private createErrorResponse(error: Error): Response {
    return new Response(renderToString(ErrorFallback(error)), {
      headers: {
        "Content-Type": "text/html",
      },
      status: 500,
    });
  }

  createCluster(): boolean {
    if (
      OSType() !== "Linux" ||
      !Bun.semver.satisfies(Bun.version, "1.1.25 - x.x.x") ||
      process.env.NODE_ENV === "development" ||
      !serverConfig.HTTPServer?.threads ||
      (typeof serverConfig.HTTPServer?.threads === "number" &&
        serverConfig.HTTPServer?.threads <= 1)
    ) {
      return false;
    }

    this.isClustered = true;

    if (cluster.isWorker) {
      this.setupWorkerMessageHandler();
      return true;
    }

    return this.setupMasterCluster();
  }

  private setupWorkerMessageHandler() {
    process.on("message", (data) => {
      if (data === "build_done") return;
      if (this.WaitingBuildFinishResolver) {
        this.WaitingBuildFinishResolver(true);
      }
    });
  }

  private setupMasterCluster(): boolean {
    const cpuCoreCount = cpus().length;
    let count = this.calculateWorkerCount(cpuCoreCount);

    this.forkWorkers(count);
    this.setupClusterMessageHandler();

    return true;
  }

  private calculateWorkerCount(cpuCoreCount: number): number {
    let count =
      globalThis.serverConfig.HTTPServer.threads === "all_cpu_core"
        ? cpuCoreCount
        : globalThis.serverConfig.HTTPServer.threads || 1;

    if (count <= 1 || process.env.NODE_ENV === "development") {
      count = 1;
    }

    if (count > cpuCoreCount) {
      console.error(
        `Server Config\nAvailable Core: ${cpuCoreCount}\nServerConfig: ${count}`
      );
      count = cpuCoreCount;
    }

    return count;
  }

  private forkWorkers(count: number) {
    for (let i = 0; i < count; i++) {
      cluster.fork({
        bun_worker: i.toString(),
      });
    }
  }

  private setupClusterMessageHandler() {
    cluster.on("message", async (worker, _message) => {
      const message = _message as ClusterMessageType;

      switch (message.task) {
        case "revalidate":
          revalidate(...message.data.path);
          break;
        case "update_build":
          await this.handleUpdateBuild(message.data.path);
          break;
        case "getSession":
          this.handleGetSession(worker, message);
          break;
        case "setSession":
          this.handleSetSession(message);
          break;
        case "deleteSession":
          DeleteSessionByID(message.data.id);
          break;
      }
    });
  }

  private async handleUpdateBuild(path?: string) {
    if (path) await builder.resetPath(path);
    await builder.makeBuild();
    await this.updateWorkerData();
  }

  private handleGetSession(worker: any, message: ClusterMessageType) {
    if (message.task === "getSession" && "id" in message.data) {
      worker.send({
        data: {
          data: GetSessionByID(message.data.id) || false,
          id: message.data.id,
        },
        task: "getSession",
      } as ClusterMessageType);
    }
  }

  private handleSetSession(message: ClusterMessageType) {
    if (message.task === "setSession" && "type" in message.data && "id" in message.data && "sessionData" in message.data) {
      SetSessionByID(
        message.data.type,
        message.data.id,
        message.data.sessionData
      );
    }
  }
  private makeBuildAwaiter() {
    this.waittingBuildFinish = new Promise((resolve) => {
      this.WaitingBuildFinishResolver = resolve;
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
