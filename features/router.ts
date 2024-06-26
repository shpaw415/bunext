export { navigate } from "../internal/router/index.tsx";

// only use this module in a server context

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
const noBuilderThrow = () => new Error("Builder could't be loaded");

const builderModule = isServer
  ? await import("../internal/build.ts")
  : undefined;

export async function revalidate(path: string) {
  if (!isServer) publicThrow();
  if (!builderModule?.builder) throw noBuilderThrow();

  const route = findRouteOrThrow(path);
  if (builderModule.builder.findPathIndex(route.filePath) == -1) return;
  builderModule.builder.resetPath(route.filePath);
  await builderModule.builder.makeBuild();
}
/**
 *
 * @param path relative path from src/pages Exemple: "/" or "/user"
 * @param seconde every x seconde to revalide
 */

export function revalidateEvery(path: string, seconde: number) {
  if (!isServer) return;
  if (!builderModule?.builder) throw noBuilderThrow();

  const _revalidate = builderModule.builder.revalidates.find(
    (r: any) => r.path === path
  );
  if (!_revalidate) {
    builderModule.builder.revalidates.push({
      path: path,
      time: seconde * 1000,
    });
    return;
  }
}
