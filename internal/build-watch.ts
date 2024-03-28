import { watchBuild } from "../bun-react-ssr/watch";
import { sendSignal } from "../dev/hotServer";
import { exitCodes, paths } from "../globals";
import "../dev/dev";

export const doWatchBuild = (showError: boolean) =>
  watchBuild(async () => {
    const res = doBuild();
    console.log("new build succeed: ", res);
    if (!res && !showError) process.exit(exitCodes.build);
    else if (!res && showError) globalThis.devConsole.error = "Build Error";
    sendSignal();
  }, [paths.basePagePath, "static"]);

function doBuild() {
  const proc = Bun.spawnSync({
    cmd: ["bun", `${paths.bunextModulePath}/internal/build.ts`],
    stdout: "inherit",
  });
  return proc.success;
}
