import { builder } from "./build";
import { router } from "./router";
import "./server_global";
import { normalize } from "../../features/utils";
import type { MatchedRoute } from "bun";
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

function setDevCurrentPath(match: MatchedRoute) {
  globalThis.dev.current_dev_path = match.filePath.replace(
    normalize(process.cwd() + "/src") + "/",
    ""
  );
}
