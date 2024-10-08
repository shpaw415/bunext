"use client";

import { cloneElement } from "react";

import { navigate } from "../internal/router/index.tsx";
import type { Builder } from "../internal/build.ts";
// only use this module in a server context

const isServer = typeof window == "undefined";
const builder = (
  isServer ? (await import("../internal/build.ts")).builder : undefined
) as Builder;
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

async function revalidate(path: string) {
  if (!isServer) publicThrow();

  const route = findRouteOrThrow(path);
  if (builder.findPathIndex(route.filePath) == -1) return;

  if ((await import("node:cluster")).default.isWorker) {
    process.send?.({
      task: "revalidate",
      data: {
        path,
      },
    });
    return;
  }

  builder.resetPath(route.filePath);
  await builder.makeBuild();
}
/**
 *
 * @param path relative path from src/pages Exemple: "/" or "/user"
 * @param seconde every x seconde to revalide
 */

function revalidateEvery(path: string, seconde: number) {
  if (!isServer) return;

  const _revalidate = builder.revalidates.find((r: any) => r.path === path);
  if (!_revalidate) {
    builder.revalidates.push({
      path: path,
      time: seconde * 1000,
    });
    return;
  }
}

function Link({ href, children }: { href: string; children: JSX.Element }) {
  return cloneElement<React.HTMLAttributes<HTMLElement>>(children, {
    onClick: (e) => {
      children.props.onClick && children.props.onClick(e);
      navigate(href);
    },
  });
}

export { navigate, Link, revalidate, revalidateEvery };
