import { watchBuild } from "../bun-react-ssr/watch";
import { sendSignal } from "../dev/hotServer";
import { paths } from "../globals";
export const doWatchBuild = () =>
  watchBuild(async () => {
    console.log("new build succeed: ", doBuild());
    sendSignal();
  }, [paths.basePagePath, "static"]);

function doBuild() {
  const proc = Bun.spawnSync({
    cmd: ["bun", `${paths.bunextModulePath}/internal/build.ts`],
    stdout: "inherit",
  });
  return proc.success;
}
