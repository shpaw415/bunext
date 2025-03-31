import { builder } from "./build";
import { router } from "./router";
import "../internal/server_global";
import { normalize } from "../features/utils";
import type { MatchedRoute } from "bun";

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
    setDevCurrentPath(match);
    await builder.resetPath(match.filePath);
    await builder.makeBuild(match.filePath);
  }
}

function setDevCurrentPath(match: MatchedRoute) {
  globalThis.dev.current_dev_path = match.filePath.replace(
    normalize(process.cwd() + "/src") + "/",
    ""
  );
}
