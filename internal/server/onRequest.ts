import { builder } from "./build";
import { router } from "./router";
import "./server_global";
import type { MatchedRoute } from "bun";
import { relative } from "node:path";
import {
  benchmark_console,
  DevConsole,
  TerminalIcon,
  TextColor,
  ToColor,
} from "./logs";

export default async function OnRequest(request: Request) {
  await onDevRequest(request);
}

async function onDevRequest(request: Request) {
  if (process.env.NODE_ENV != "development") return;
  const match = router.server.match(request);
  if (
    match &&
    !match.src.endsWith("layout.tsx") &&
    match.pathname != "/favicon.ico" &&
    request.headers.get("accept") != "application/vnd.server-side-props" &&
    match.filePath.endsWith("tsx")
  ) {
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
      }
    );
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
