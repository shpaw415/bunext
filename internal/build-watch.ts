import { watchBuild } from "../bun-react-ssr/watch";
import { sendSignal } from "../dev/hotServer";
import { exitCodes, paths } from "./globals";
import "../dev/dev";

export const doWatchBuild = (showError: boolean) =>
  watchBuild(async () => {
    sendSignal();
  }, [paths.basePagePath, "static"]);

export async function doBuild() {
  const proc = Bun.spawnSync({
    cmd: ["bun", `${paths.bunextModulePath}/internal/build.ts`],
    stdout: "inherit",
    env: {
      ...process.env,
      __PAGE__: JSON.stringify(
        globalThis.pages.map((e) => {
          return { page: "", path: e.path };
        })
      ),
      ssrElement: JSON.stringify(globalThis.ssrElement ?? []),
    },
  });
  return proc.exitCode == 0;
}
