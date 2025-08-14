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
import { builder } from "../internal/server/build";
import { RequestManager, router } from "../internal/server/router";

// Types
import type { BunextPlugin } from "./types";
import type { MatchedRoute } from "bun";
import type { BunextRequest } from "../internal/server/bunextRequest";

// Node.js path utilities
import { relative, normalize } from "node:path";

// Logging utilities
import {
  benchmark_console,
  DevConsole,
  TerminalIcon,
  TextColor,
  ToColor,
} from "../internal/server/logs";

// Constants
const CWD = process.cwd();
const DEVTOOLS_ENDPOINT = "/.well-known/appspecific/com.chrome.devtools.json";
const SERVER_SIDE_PROPS_HEADER = "application/vnd.server-side-props";
const GETCSSPATH_PATHNAME = "/GetCssPaths";


// Plugin configuration
const plugin: BunextPlugin =
  process.env.NODE_ENV === "development"
    ? {
      priority: -1,
      router: {
        request: async (manager) => {
          await handleDevRequest(manager);
          (handleDevtoolsJson(manager.bunextReq)) || (await handleCssPaths(manager.bunextReq));
        },
      },
    }
    : {};


/**
 * handle css paths
 * This function collects CSS paths for the current route and returns them.
 */
async function handleCssPaths(req: BunextRequest) {
  if (req.URL.pathname !== GETCSSPATH_PATHNAME) return;
  return req.__BYPASS_RESPONSE__ = new Response(JSON.stringify(await router.getCssPaths()), {
    headers: {
      "Content-Type": "application/json",
    },
  });
}

/**
 * Handles devtools JSON endpoint for Chrome DevTools integration
 */
function handleDevtoolsJson(req: BunextRequest): boolean {
  if (req.URL.pathname !== DEVTOOLS_ENDPOINT) return false;

  req.__BYPASS_RESPONSE__ = new Response(
    JSON.stringify({
      name: "Bunext",
      workspace: {
        root: CWD,
        uuid: Bun.randomUUIDv7(),
      },
    })
  );
  return true;
}

/**
 * Checks if a route should trigger a rebuild in development mode
 */
function shouldRebuildRoute(match: MatchedRoute | null, request: Request): boolean {
  return !!(
    match &&
    !match.src.endsWith("layout.tsx") &&
    match.pathname !== "/favicon.ico" &&
    request.headers.get("accept") !== SERVER_SIDE_PROPS_HEADER &&
    match.filePath.endsWith(".tsx") &&
    !isCurrentDevPath(match)
  );
}

/**
 * Handles development-specific request processing
 */
async function handleDevRequest(request: RequestManager) {

  const match = request.serverSide;
  if (shouldRebuildRoute(match, request.request)) {

    await buildRoute(match!);
    return;
  }

  await handleIndexJsRequest(request);
}

/**
 * Handles requests for index.js files that might need rebuilding
 */
async function handleIndexJsRequest(request: RequestManager) {
  const url = request.bunextReq.URL;

  if (!url.pathname.endsWith("index.js")) {
    return;
  }

  const normalizedPath = normalize(
    url.pathname.replace("index.js", "").replace(router.pageDir, "")
  );

  const match = router.server.match(normalizedPath);

  if (match?.filePath?.endsWith("tsx") && !isCurrentDevPath(match)) {
    await buildRoute(match);
  }
}
/**
 * Sets the current development path for tracking active builds
 */
function setCurrentDevPath(match: MatchedRoute) {
  const relativePathFromSrc = relative(CWD + "/src", match.filePath);
  const pathnameWithoutExtension = relativePathFromSrc.split(".").slice(0, -1).join(".");

  globalThis.dev = {
    current_dev_path: relativePathFromSrc,
    pathname: pathnameWithoutExtension,
  };
}

/**
 * Checks if the given match corresponds to the currently active development path
 */
function isCurrentDevPath(match: MatchedRoute): boolean {
  if (!globalThis.dev?.current_dev_path) {
    return false;
  }

  const relativePathFromSrc = relative(CWD + "/src", match.filePath);
  return globalThis.dev.current_dev_path === relativePathFromSrc;
}

/**
 * Builds a specific route with logging and timing
 */
async function buildRoute(match: MatchedRoute) {
  await builder.awaitBuildFinish();

  console.info(
    ToColor(
      TextColor,
      `compiling ${match.pathname} ...`
    ).toString()
  );

  setCurrentDevPath(match);

  await benchmark_console(
    (time) =>
      `${ToColor("green", TerminalIcon.success)} ${ToColor(
        TextColor,
        `compiled ${match.pathname} in ${time}ms`
      )}`,
    async () => {
      await builder.resetPath(match.filePath);
      await builder.makeBuild(match.filePath);
      router.client.reload();
    }
  );
}

export default plugin;
