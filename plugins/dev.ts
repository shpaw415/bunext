/**
 * Development Plugin for Bunext
 * 
 * This plugin handles development-specific features including:
 * - Hot reloading and rebuild triggers
 * - Chrome DevTools integration
 * - Development path tracking
 * - Automatic compilation of changed routes
 */

// Core dependencies
import { builder } from "internal/server/build";
import { RequestManager, router } from "internal/server/router";

// Types
import type { BunextPlugin } from "./types";
import type { BunextRequest } from "internal/server/bunextRequest";

// Logging utilities
import {
  benchmark_console,
  TerminalIcon,
  TextColor,
  ToColor,
} from "plugins/console";
import { IPCManager } from "./utils";
import type { MatchedRoute } from "bun";


// Constants
const CWD = process.cwd();
const DEVTOOLS_ENDPOINT = "/.well-known/appspecific/com.chrome.devtools.json";
const GETCSSPATH_PATHNAME = "/GetCssPaths";


declare global {
  var __DEV_PATH_MATCH__: MatchedRoute | undefined | null;
}

// Plugin configuration
const plugin: BunextPlugin = {
  name: "bunext-dev-plugin",
  priority: 0,
  router: process.env.NODE_ENV == "development" ? {
    before_request(manager) {
      return handleDevRequest(manager);
    },
    request: async (manager) => {
      if (manager.bunextReq.isResponseSetted()) return;
      else if (handleDevtoolsJson(manager.bunextReq)) return;
      else if (await handleCssPaths(manager.bunextReq)) return;

      if (manager.request.method === "PATCH") {
        manager.bunextReq.setResponse("ok").preventRewrite().preventGlobalValuesInjection().sendNow();
      }
    },
  } : undefined,
  serverStart: {
    dev_main() {
      builder.clearBuildDir();
    },
  },
  onFileSystemChange() {
    if (!globalThis.__DEV_PATH_MATCH__) return;
    return buildRoute(globalThis.__DEV_PATH_MATCH__.pathname, globalThis.__DEV_PATH_MATCH__.filePath);
  },
};


/**
 * handle css paths
 * This function collects CSS paths for the current route and returns them.
 */
async function handleCssPaths(req: BunextRequest) {
  if (req.URL.pathname !== GETCSSPATH_PATHNAME) return false;
  req.setResponse(JSON.stringify(await router.getCssPaths()), {
    headers: {
      "Content-Type": "application/json",
    }
  }).sendNow();
  return true
}

/**
 * Handles devtools JSON endpoint for Chrome DevTools integration
 */
function handleDevtoolsJson(req: BunextRequest): boolean {
  if (req.URL.pathname !== DEVTOOLS_ENDPOINT) return false;
  req.setResponse(JSON.stringify({
    name: "Bunext",
    workspace: {
      root: CWD,
      uuid: Bun.randomUUIDv7(),
    },
  })).sendNow();
  return true;
}
/**
 * Handles development-specific request processing
 */
async function handleDevRequest(request: RequestManager) {
  const newDevRoute = request.serverSide;
  if (
    newDevRoute && request.request.method == "PATCH" && request.request.headers.get("x-bunext-dev-router-update") && request.serverSide
  ) {
    globalThis.__DEV_PATH_MATCH__ = newDevRoute;
    //await buildRoute(newDevRoute.pathname, newDevRoute.filePath);
    return;
  } else if (request.bunextReq.isAskingHTML && newDevRoute && newDevRoute?.pathname != globalThis.__DEV_PATH_MATCH__?.pathname) {
    globalThis.__DEV_PATH_MATCH__ = newDevRoute;
    await buildRoute(newDevRoute.pathname, newDevRoute.filePath);
  }

}
/**
 * Sets the current development path for tracking active builds
 */
const ipc = IPCManager.getInstanceForCurrentProcess<"main">();

/**
 * Builds a specific route with logging and timing
 */
async function buildRoute(pathname: string, filePath: string) {
  console.info(
    ToColor(
      TextColor,
      `compiling ${pathname} ...`
    )
  );

  await benchmark_console(
    (time) =>
      `${ToColor("green", TerminalIcon.success)} ${ToColor(
        TextColor,
        `compiled ${pathname} in ${time}ms`
      )}`,
    async () => {
      const res = await builder.build(filePath);

      if (res && !res.success) {
        console.error(ToColor("red", TerminalIcon.error), ToColor("red", `failed to compile ${pathname}`), "\n", res.logs);
      } else if (res && res.success) {
        router.client.reload();
        router.server.reload();
      }

    }
  );
}

export default plugin;
