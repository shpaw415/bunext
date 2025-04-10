import { watch } from "node:fs";
import { sendSignal } from "../../dev/hotServer";
import "./server_global";
import { paths } from "../globals";
import { builder } from "./build";
import { normalize } from "node:path";

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

export function watchBuild(build: initFunction, paths: string[]) {
  const wrapper = new SingleTaskPool(build);
  wrapper.run();
  return paths.map((path) =>
    watch(path, { recursive: true }, (type, path) =>
      wrapper.run(path || undefined)
    )
  );
}

export const doWatchBuild = () =>
  watchBuild(
    async (path) => {
      if (!path || !globalThis.dev.current_dev_path) return;
      const EntryPoints = await builder.getEntryPoints();
      const probablePath = normalize(
        `${process.cwd()}/src/${globalThis.dev.current_dev_path}`
      );
      if (EntryPoints.includes(probablePath)) {
        await builder.resetPath(probablePath);
        await builder.makeBuild(probablePath);
      }
      sendSignal();
    },
    [paths.staticPath, paths.basePath]
  );
