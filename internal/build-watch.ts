import { watchBuild } from "../bun-react-ssr/watch";
import { paths } from "../globals";
import { sendSignal } from "../dev/dev";
export const doWatchBuild = () =>
  watchBuild(async () => {
    if (doBuild() === 101) process.exit(101);
    sendSignal();
  }, [paths.basePagePath]);

function doBuild() {
  return Bun.spawnSync({
    cmd: ["bun", `${paths.bunextModulePath}/internal/build.ts`],
    stdout: "ignore",
  }).exitCode;
}
