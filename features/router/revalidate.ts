"use client";

import { navigate } from "../../internal/router/index.tsx";
import type { Builder } from "../../internal/server/build.ts";
import type { ClusterMessageType } from "../../internal/types.ts";
// only use this module in a server context

const isServer = typeof window == "undefined";
const publicThrow = () => {
  throw new Error("you cannot call revalidate in a client context");
};
const noRouteThrow = (route: string) =>
  new Error(`route ${route} does not exists`);

const findRouteOrThrow = (path: string) => {
  const router = new Bun.FileSystemRouter({
    style: "nextjs",
    dir: process.cwd() + "/src/pages",
  });
  const matched = router.match(path);
  if (!matched) throw noRouteThrow(path);
  return matched;
};

async function revalidate(...path: string[]) {
  const builder = (await import("../../internal/server/build.ts"))
    .builder as Builder;
  if (!isServer) publicThrow();
  const route = path
    .map((path) => findRouteOrThrow(path))
    .filter((route) => builder.findPathIndex(route.filePath));
  if ((await import("node:cluster")).default.isWorker) {
    process.send?.({
      task: "revalidate",
      data: {
        path,
      },
    } as ClusterMessageType);
    return;
  }
  route.map(({ pathname }) =>
    globalThis.CacheManage.removeSSRDefaultPage(pathname)
  );
  await Promise.all(route.map(({ filePath }) => builder.resetPath(filePath)));
  await builder.makeBuild();
}
/**
 *
 * @param path relative path from src/pages Exemple: "/" or "/user"
 * @param seconde every x seconde to revalide
 */

async function revalidateEvery(path: string | string[], seconde: number) {
  if (!isServer) return;
  if (!Array.isArray(path)) path = [path];
  const builder = (await import("../../internal/server/build.ts")).builder;

  if (builder.revalidates.find((r: any) => r.path === path)) return;
  for (const p of path) {
    builder.revalidates.push({
      path: p,
      time: seconde * 1000,
    });
  }
}

let timer: Timer | undefined = undefined;

/**
 * revalidate the specific path like: /some/path/id_1
 * @param pathname pathLike of the route you want to revalidate
 * @param timeout timeout in seconds
 */
function revalidateStatic(pathlike: Request | string, timeout?: number) {
  if (!isServer) publicThrow();

  import("../../internal/caching/index.ts").then(async (module) => {
    const revalidate = async () => {
      const manager = new module.CacheManager();
      if (pathlike instanceof Request) {
        const { router } = await import("../../internal/server/router.tsx");
        const match = router.server.match(pathlike);
        manager.removeStaticPage(match?.pathname as string);
      } else {
        manager.removeStaticPage(pathlike);
      }
    };
    if (timeout == undefined) revalidate();
    else {
      clearTimeout(timer);
      timer = setTimeout(() => revalidate(), timeout * 1000);
    }
  });
}

export { navigate, revalidate, revalidateEvery, revalidateStatic };
