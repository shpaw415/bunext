import { watchBuild } from "../bun-react-ssr/watch";
import { paths } from "../globals";
import { sendSignal } from "../dev/dev";
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
