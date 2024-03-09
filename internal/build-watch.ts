import { watchBuild } from "../bun-react-ssr/watch";
import { paths } from "../globals";
import { sendSignal } from "../dev/dev";
export const doWatchBuild = () =>
  watchBuild(async () => {
    console.log(await doBuild());
    //if (doBuild() === 101) process.exit(101);
    sendSignal();
  }, [paths.basePagePath]);

async function doBuild() {
  const proc = Bun.spawn({
    cmd: ["bun", `${paths.bunextModulePath}/internal/build.ts`],
  });
  await proc.exited;
  return proc.exitCode;
}
