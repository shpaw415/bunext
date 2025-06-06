import { builder } from "../internal/server/build";
import type { BunextPlugin } from "./types";
import { router } from "../internal/server/router";
import { relative } from "node:path";
import {
  benchmark_console,
  DevConsole,
  TerminalIcon,
  TextColor,
  ToColor,
} from "../internal/server/logs";
import type { MatchedRoute } from "bun";
import { normalize } from "path";
import type { BunextRequest } from "../internal/server/bunextRequest";

const plugin: BunextPlugin =
  process.env.NODE_ENV == "development"
    ? {
        router: {
          request: async (request) => {
            await onDevRequest(request.request);
            return await devtoolsJson(request);
          },
        },
      }
    : {};

async function devtoolsJson(req: BunextRequest) {
  if (req.URL.pathname != "/.well-known/appspecific/com.chrome.devtools.json")
    return;

  return req.__SET_RESPONSE__(
    new Response(
      JSON.stringify({
        name: "Bunext",
        workspace: {
          root: process.cwd(),
          uuid: Bun.randomUUIDv7(),
        },
      })
    )
  );
}

async function onDevRequest(request: Request) {
  if (process.env.NODE_ENV != "development") return;
  const match = router.server.match(request);
  if (
    match &&
    !match.src.endsWith("layout.tsx") &&
    match.pathname != "/favicon.ico" &&
    request.headers.get("accept") != "application/vnd.server-side-props" &&
    match.filePath.endsWith(".tsx") &&
    !isDevCurrentPath(match)
  ) {
    await MakeBuild(match);
    return;
  }

  const url = new URL(request.url);
  if (url.pathname.endsWith("index.js")) {
    const match = router.server.match(
      normalize(
        url.pathname.replace("index.js", "").replace(router.pageDir, "")
      )
    );
    if (match?.filePath?.endsWith("tsx") && !isDevCurrentPath(match)) {
      await MakeBuild(match);
      return;
    }
  }
}
const cwd = process.cwd();
function setDevCurrentPath(match: MatchedRoute) {
  const relativePathFromSrcPath = relative(cwd + "/src", match.filePath);
  const PathnameArray = relativePathFromSrcPath.split(".");
  PathnameArray.pop();

  globalThis.dev = {
    current_dev_path: relativePathFromSrcPath,
    pathname: PathnameArray.join("."),
  };
}
function isDevCurrentPath(match: MatchedRoute) {
  if (globalThis.dev?.current_dev_path) {
    const relativePathFromSrcPath = relative(cwd + "/src", match.filePath);
    return globalThis.dev.current_dev_path == relativePathFromSrcPath;
  }
  return false;
}

async function MakeBuild(match: MatchedRoute) {
  await builder.awaitBuildFinish();
  DevConsole(
    `${ToColor("blue", TerminalIcon.info)} ${ToColor(
      TextColor,
      `compiling ${match.pathname} ...`
    )}`
  );
  setDevCurrentPath(match);
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
