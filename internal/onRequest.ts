import { builder } from "./build";
import { router } from "./router";

export default async function OnRequest(request: Request) {
  await onDevRequest(request);
}

async function onDevRequest(request: Request) {
  if (process.env.NODE_ENV != "development") return;
  const match = router.server.match(request);
  if (
    match &&
    !match.src.endsWith("layout.tsx") &&
    match.pathname != "/favicon.ico"
  ) {
    await builder.resetPath(match.filePath);
    await builder.makeBuild(match.filePath);
  }
}
