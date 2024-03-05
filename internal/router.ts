import { builder } from "./build";

declare global {
  var pages: Array<{
    path: string;
    page: string;
  }>;

  var revalidate: {
    path: string;
    interval: Timer;
  }[];
}

export async function revalidate(path: string) {
  const index = globalThis.pages.findIndex((p) => p.path === path);
  if (index == -1) return;
  globalThis.pages.splice(index, 1);
  await builder.buildPath(path);
}
/**
 *
 * @param path relative path from src/pages Exemple: "/" or "/user"
 * @param seconde every x seconde to revalide
 */
export function revalidateEvery(path: string, seconde: number) {
  const _revalidate = globalThis.revalidate.find((r) => r.path === path);
  if (!_revalidate) {
    globalThis.revalidate.push({
      path: path,
      interval: setInterval(() => {
        revalidate(path);
      }, seconde),
    });
    return;
  }
  clearInterval(_revalidate.interval);
  _revalidate.interval = setInterval(() => {
    revalidate(path);
  }, seconde);
}
