import "../../../internal/server/server_global";
import type { Build_Plugins } from "../types";
import { resolve } from "path";

async function MakeEntryPoints() {
  const dynamicPaths = globalThis.serverConfig.router?.dynamicPaths;
  if (!dynamicPaths) return [];
  const glob = new Bun.Glob("**/*.{ts,tsx,js,jsx,css}");
  const cwd = process.cwd();

  const entrypoints = (
    await Promise.all(
      dynamicPaths?.map((path) =>
        Array.fromAsync(
          glob.scan({
            cwd: resolve(cwd, path),
            absolute: true,
          })
        )
      )
    )
  ).reduce((p, n) => [...p, ...n], []);

  return entrypoints;
}
const entrypoints = await MakeEntryPoints();

const plugin: Build_Plugins = {
  buildOptions: {
    entrypoints,
  },
};

export default plugin;
