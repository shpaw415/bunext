// this is called on server start

import { router } from "./router";

export default async function Make() {
  await router.initPlugins();
  const plugins = router
    .getPlugins()
    .map((p) => p.serverStart)
    .filter((p) => p != undefined);
  const mains = plugins.map((p) => p.main).filter((p) => p != undefined);

  if (process.env.NODE_ENV == "development") {
    const devs = plugins.map((p) => p.dev).filter((p) => p != undefined);
    await Promise.all(devs.map((plugin) => plugin()));
  }

  await Promise.all(
    mains.map(async (plugin) => {
      try {
        await plugin();
      } catch (e) {
        console.error(`OnServerStart plugin failed`, e);
      }
    })
  );
}

export async function OnServerStartCluster() {
  await router.initPlugins();
  const plugins = router
    .getPlugins()
    .map((p) => p?.serverStart?.cluster)
    .filter((p) => p != undefined);

  await Promise.all(plugins.map((p) => p?.()));
}
