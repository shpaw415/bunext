const isServer = typeof window == "undefined";
const publicThrow = () => {
  throw new Error("you cannot call revalidate in a client context");
};
const noRouteThrow = (route: string) =>
  new Error(`route ${route} does not exsits`);

const findRouteOrThrow = (path: string) => {
  const router = new Bun.FileSystemRouter({
    style: "nextjs",
    dir: process.cwd() + "/src/pages",
  });
  const matched = router.match(path);
  if (!matched) throw noRouteThrow(path);
  return matched;
};

export async function revalidate(path: string) {
  if (!isServer) publicThrow();
  const serverModule = await import("../internal/makeBuild");
  const route = findRouteOrThrow(path);
  const index = globalThis.ssrElement.findIndex(
    (p) => p.path === route.filePath
  );
  if (index == -1) return;
  globalThis.ssrElement.splice(index, 1);
  await serverModule.makeBuild();
}
/**
 *
 * @param path relative path from src/pages Exemple: "/" or "/user"
 * @param seconde every x seconde to revalide
 */

export function revalidateEvery(path: string, seconde: number) {
  if (!isServer) return;
  const _revalidate = globalThis.revalidates.find((r) => r.path === path);
  if (!_revalidate) {
    globalThis.revalidates.push({
      path: path,
      time: seconde * 1000,
    });
    return;
  }
}
