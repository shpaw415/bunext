// this is called on server start

import CacheManager from "../caching";
import { Init } from "./router";
import { builder } from "./build";

export default async function Make() {
  onDev();
  CacheManager.clearSSR();
  CacheManager.clearStaticPage();
  CacheManager.clearSSRDefaultPage();
  Bun.$`mv node_modules/@types/bun/node_modules/bun-types/extensions.d.ts node_modules/@types/bun/node_modules/bun-types/extensions.d.ts.bak`;
  await Init();
}

export async function OnServerStartCluster() {
  await Init();
}

function onDev() {
  if (process.env.NODE_ENV != "development") return;
  builder.clearBuildDir();
}
