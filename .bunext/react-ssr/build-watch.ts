import { watchBuild } from "@bunpmjs/bunext/bun-react-ssr/watch";
import { paths } from "@bunpmjs/bunext/globals";
import { sendSignal } from "@bunpmjs/bunext/dev/dev";
export const doWatchBuild = () =>
  watchBuild(async () => {
    doBuild();
    sendSignal();
  }, [paths.basePagePath]);

function doBuild() {
  Bun.spawnSync({
    cmd: ["bun", `${paths.bunextModulePath}/internal/build.ts`],
    stdout: "ignore",
  });
}
