import { watchBuild } from "../bun-react-ssr/watch";
import { paths } from "../globals";
import { sendSignal } from "../dev/dev";
export const doWatchBuild = () =>
  watchBuild(async () => {
    console.log(await doBuild());
    sendSignal();
  }, [paths.basePagePath]);

async function doBuild() {
  return new Promise<number>((resolve) => {
    const proc = Bun.spawn({
      cmd: ["bun", `${paths.bunextModulePath}/internal/build.ts`],
    });
    const interval = setInterval(async () => {
      if (await proc.exited) {
        clearInterval(interval);
        resolve(await proc.exited);
      }
    }, 100);
  });
}
