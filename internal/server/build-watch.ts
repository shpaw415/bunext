import { watch } from "node:fs";
import { sendSignal } from "../../dev/hotServer";
import "./server_global";
import { paths } from "../globals";
import { builder } from "./build";
import { normalize, relative } from "node:path";
import {
  benchmark_console,
  DevConsole,
  TerminalIcon,
  TextColor,
  ToColor,
} from "./logs";
import type { BunextPlugin } from "../../plugins/types";

type initFunction = (path?: string) => Promise<any>;

class SingleTaskPool {
  stopped = true;
  pending = false;
  constructor(public init: initFunction) {}

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


export const doWatchBuild = () =>
  watchBuild(
    async (path) => {
      await Promise.all(builder.getPlugins().map((p) => p.onFileSystemChange?.(path)))

      if (!path || !globalThis.dev.current_dev_path) return;
      const EntryPoints = await builder.getEntryPoints();
      const probablePath = normalize(
        `${process.cwd()}/src/${globalThis.dev.current_dev_path}`
      );
      if (EntryPoints.includes(probablePath)) {
        const pathnameArray = relative(`${cwd}/src/pages`, probablePath).split(
          "/"
        );
        pathnameArray.pop();
        const pathname = pathnameArray.join("/") || "/";
        setTimeout(
          () =>
            DevConsole(
              `${ToColor("blue", TerminalIcon.info)} ${ToColor(
                TextColor,
                `compiling ${pathname} ...`
              )}`
            ),
          100
        );
        await benchmark_console(
          (time) =>
            `${ToColor("green", TerminalIcon.success)} ${ToColor(
              TextColor,
              `compiled ${pathname} in ${time}ms`
            )}`,
          async () => {
            await builder.resetPath(probablePath);
            await builder.makeBuild(probablePath);
          }
        );
      }
      sendSignal();
    },
    [paths.staticPath, paths.basePath]
  );
