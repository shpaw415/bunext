// this is called on server start

import CacheManager from "./caching";
import { Init } from "./router";

export default async function Make() {
  CacheManager.clearSSR();
  CacheManager.clearStaticPage();
  CacheManager.clearSSRDefaultPage();
  await Init();
}

export async function OnServerStartCluster() {
  await Init();
}
