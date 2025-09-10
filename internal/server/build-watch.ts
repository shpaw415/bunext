import { watch } from "node:fs";
import { sendSignal } from "../../dev/hotServer";
import "./server_global";
import { paths } from "../globals";
import {
  benchmark_console,
  TerminalIcon,
  TextColor,
  ToColor,
} from "plugins/console";
import { resetPath } from "plugins/server-features/ssr-page";
import { IPCManager } from "plugins/utils";
import type { MatchedRoute } from "bun";

type initFunction = (path?: string) => Promise<any>;

class SingleTaskPool {
  stopped = true;
  pending = false;
  constructor(public init: initFunction) { }

  #stop() {
    this.stopped = true;
    if (this.pending) {
      this.pending = false;
      this.run();
    }
  }

  run(path?: string) {
    if (this.stopped) {
      this.stopped = false;
      this.init(path).finally(() => this.#stop());
    } else {
      this.pending = true;
    }
  }
}

/**
 * Watches the specified directories and triggers the provided build function on file changes.
 *
 * Sets up recursive file system watchers on each path in {@link paths}. When a file change is detected, the build function is invoked with the changed file's path. Ensures that only one build runs at a time, queuing additional changes until the current build completes.
 *
 * @param build - The asynchronous function to execute when a file change is detected.
 * @param paths - An array of directory paths to watch recursively.
 * @returns An array of file system watcher instances.
 */
export function watchBuild(build: initFunction, paths: string[]) {
  const wrapper = new SingleTaskPool(build);
  wrapper.run();
  return paths.map((path) =>
    watch(path, { recursive: true }, (type, path) =>
      wrapper.run(path || undefined)
    )
  );
}
const cwd = process.cwd();
const ipc = IPCManager.getInstanceForCurrentProcess<"main">();
export const doWatchBuild = () =>
  watchBuild(
    async (path) => {
      let isBuildPrevented = false;
      const preventBuildFn = () => { isBuildPrevented = true; };
      const { pluginLoader } = await import("./plugin-loader");
      await Promise.all(
        pluginLoader.getPluginByName("onFileSystemChange").map(async (plugin) => {
          try {
            await plugin.pluginParent(path, preventBuildFn, ipc);
          } catch (error) {
            console.error(`Error in plugin's onFileSystemChange hook, name: ${plugin.name}: `, error);
          }
        })
      );

      if (!path || !globalThis.__DEV_PATH_MATCH__) return;
      const matched = globalThis.__DEV_PATH_MATCH__ as MatchedRoute;
      setTimeout(
        () =>
          console.log(
            `${ToColor("blue", TerminalIcon.info)} ${ToColor(
              TextColor,
              `compiling ${matched.name} ...`
            )}`
          ),
        100
      );
      await benchmark_console(
        (time) =>
          `${ToColor("green", TerminalIcon.success)} ${ToColor(
            TextColor,
            `compiled ${matched.pathname} in ${time}ms`
          )}`,
        async () => {

          if (isBuildPrevented) return;
          await resetPath(matched.filePath);
          await ipc.actions.builder.build(matched.name);
        }
      );
      if (!isBuildPrevented) sendSignal();
    },
    [paths.staticPath, paths.basePath]
  );