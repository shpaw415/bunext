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

// Node.js modules
import { cpus, type as OSType } from "node:os";
import cluster, { type Cluster } from "node:cluster";
import { onServerStartPlugins } from "./server-start.ts";

// Caching and logging
import "plugins/fetch-caching/fetch.ts";
import {
  benchmark_console,
  TerminalIcon,
  TextColor,
  ToColor,
} from "plugins/console";
import { DevWsMessageHandler, type DevWsMessageTypes } from "../../dev/hotServer.ts";
import { ExitCodeDescription } from "../../bin/exit-codes.ts";
import { initServerSide } from "./init";
import { IPCManager } from "plugins/utils";

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      bun_worker?: string;
    }
  }
}

// Constants
const EXCLUDED_PATHS_FROM_LOGGING = [
  "/src/pages",
  "/node_modules/react",
  "/.bunext",
  "/node_modules/scheduler",
  "/chunk-",
] as const;

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

type BunextServerProps = {
  preventDevConsole?: boolean;
};

const DEFAULT_PROPS: BunextServerProps = {
  preventDevConsole: false,
};

class BunextServer {
  public port = globalThis.serverConfig.HTTPServer.port || 3000;
  public server?: _Server;
  public hotServerPort = globalThis.serverConfig.Dev.hotServerPort || 3001;
  public hotServer?: _Server;
  public hostName = "localhost";

  public waittingBuildFinish: Promise<boolean> | undefined;
  public WaitingBuildFinishResolver:
    | ((value: boolean | PromiseLike<boolean>) => void)
    | undefined;

  constructor({
  }: BunextServerProps) {
  }

  static async getInitedInstance(props: BunextServerProps = DEFAULT_PROPS): Promise<BunextServer> {
    if (globalThis.Server) return globalThis.Server;

    const instance = new BunextServer(props);
    await instance.init();

    globalThis.Server = instance;

    return instance;
  }

  startServer() {
    this.server = Bun.serve({
      ...{
        port: this.port as any,
        ...globalThis.serverConfig?.HTTPServer.config,
      },
      fetch: this.createFetchHandler(),
      error: (error: Error) => {
        //console.error(error);
      }
    });
  }

  async close() {
    console.info("Shutting down server...");
    await this.server?.stop();
    await this.hotServer?.stop();
  }

  Reboot() {
    console.info("Rebooting server...");
    process.exit(ExitCodeDescription[3].code);
  }

  private createFetchHandler(): (request: Request) => Promise<Response> {
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
          try {
            const response = await this.serve(request);
            if (response instanceof Response) return response;
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
      error(error) {
        process.exit(1);
      },
    });

    // Clean up inactive sockets periodically
    setInterval(clearInactiveSockets, SOCKET_CLEANUP_INTERVAL);
  }

  async init() {
    console.info("Starting...");
    await benchmark_console(
      (time) =>
        `Ready in ${time}ms`,
      () => this._init_()
    );
  }

  private isClusterEnabled(): boolean {
    return (
      OSType() === "Linux" &&
      Bun.semver.satisfies(Bun.version, "1.1.25 - x.x.x") &&
      process.env.NODE_ENV !== "development" &&
      Boolean(serverConfig.HTTPServer?.threads) &&
      (
        typeof serverConfig.HTTPServer?.threads !== "number" || serverConfig.HTTPServer?.threads > 1
      )
    );
  }

  private __init_dev__() {
    doWatchBuild();
    this.serveHotServer(globalThis.serverConfig.Dev.hotServerPort);
  }

  private async __init_prod__() {
    const isClusteredEnabled = this.isClusterEnabled();

    if (isClusteredEnabled && cluster.isPrimary) {
      const workers = this.createCluster();
      IPCManager.getInstanceForMain().setClusterProcesses(workers);
      console.info("Starting Bunext in Multi-threaded mode");
    } else if (isClusteredEnabled && cluster.isWorker) {
      IPCManager.getInstanceForCluster();
    }

    if (cluster.isPrimary) {
      const buildoutput = await IPCManager.getInstanceForCurrentProcess().actions.builder.build();
      if (!buildoutput) {
        throw new Error("Production build failed", { cause: buildoutput });
      }
      buildoutput.data?.revalidates && setRevalidate(buildoutput.data.revalidates);
    }
  }

  private async _init_() {
    const isDev = process.env.NODE_ENV == "development";

    await initServerSide();
    await onServerStartPlugins();
    this.startServer();

    isDev ? this.__init_dev__() : await this.__init_prod__();

    return this;
  }

  async serve(request: Request): Promise<Response | null> {
    let serverActionData: FormData = new FormData();
    const headers = request.headers.toJSON();

    if (request.url.endsWith("/ServerActionGetter")) {
      serverActionData = await request.formData();
    }

    try {
      const response = await router.serve(
        request,
        headers,
        serverActionData
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
    return new Response(renderToString(ErrorFallback({ error })), {
      headers: {
        "Content-Type": "text/html",
      },
      status: 500,
    });
  }

  createCluster(): Array<Cluster["worker"]> {
    const cpuCoreCount = cpus().length;
    let count = this.calculateWorkerCount(cpuCoreCount);

    this.forkWorkers(count);
    return Object.values(cluster.workers || {}).filter((worker): worker is Cluster["worker"] => worker !== undefined) as Array<Cluster["worker"]>;
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
    const ipc = IPCManager.getInstanceForMain();

  }
}

export { BunextServer };
