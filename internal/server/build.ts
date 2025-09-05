"server only";

import "./server_global.ts";
import { join } from "node:path";
import {
  type BuildOutput,
  type BunPlugin,
} from "bun";
import { normalize } from "path";
import { mkdirSync, rmSync, unlinkSync } from "node:fs";
import "../globals";
import { router } from "./router";
import * as React from "react";
import { pluginLoader } from "internal/server/plugin-loader.ts";

import type {
  BuildWorkerMessage,
  BuildWorkerResponse,
} from "./build-worker.ts";
import { IPCManager } from "plugins/utils";

globalThis.React = React;

export type BuildOuts = {
  revalidates: {
    path: string;
    time: number;
  }[];
};

type _Mainoptions = {
  baseDir: string;
  buildDir: ".bunext/build";
  pageDir: "src/pages";
  hydrate: ".bunext/react-ssr/hydrate.ts";
};

const cwd = process.cwd();

class Builder {
  public options: _Mainoptions = {
    pageDir: join("src", "pages") as "src/pages",
    buildDir: join(".bunext", "build") as ".bunext/build",
    hydrate: join(".bunext", "react-ssr", "hydrate.ts") as ".bunext/react-ssr/hydrate.ts",
    baseDir: cwd,
  };
  public preBuildPaths: Array<string> = [];
  public plugins: BunPlugin[] = [];
  /**
   * absolute path
   */
  public revalidates: {
    path: string;
    time: number;
  }[] = [];
  private inited = false;
  public BuilderWorker?: Bun.Subprocess<"ignore", "inherit", "inherit">;
  public BuildWorkerAwaiter: Promise<void> = Promise.resolve();
  private BuildWorkerResolver: () => void = () => { };

  public remove_node_modules_files_path: string[] = [];

  clearBuildDir() {
    try {
      rmSync(this.options.buildDir as string, {
        recursive: true,
        force: true,
      });
    } catch { }
    mkdirSync(
      normalize(`${this.options.buildDir as string}/${this.options.pageDir}`),
      { recursive: true }
    );
  }

  private Check_remove_node_modules_files_path() {
    for (const path of this.remove_node_modules_files_path) {
      if (!import.meta.resolve(path))
        throw new Error(`${path} does not resolve`);
    }
  }

  async init() {
    if (this.inited) return this;
    this.inited = true;
    this.Check_remove_node_modules_files_path();
    await this.InitGetCustomPluginsFromUser();
    this.createBuildWorker();

    this.remove_node_modules_files_path.push(
      ...pluginLoader.getPluginByName("removeFromBuild").flatMap((p) => p.pluginParent ?? [])
    );
    return this;
  }

  private async getPluginBuildConfig() {
    const pluginsData = pluginLoader.getPluginByName("build").map((e) => e.pluginParent);

    const config = await Promise.all(pluginsData
      .map((p) => p.buildOptions)
      .filter((p) => p != undefined)
      .map((p) => (typeof p === "function" ? p() : p)));

    const plugins = pluginsData
      .map((p) => p.plugin)
      .filter((p) => p != undefined);

    const entrypoints = config
      .map((p) => p.entrypoints)
      .filter((p) => p != undefined)
      .reduce((p, n) => [...p, ...n], []);

    const external = config
      .map((p) => p.external)
      .filter((p) => p != undefined)
      .reduce((p, n) => [...p, ...n], []);

    const define = Object.assign(
      {},
      ...config.map((p) => p.define).filter((p) => p != undefined)
    );

    return {
      ...Object.assign({}, ...config),
      entrypoints,
      external,
      define,
      plugins,
    } as Partial<Bun.BuildConfig>;
  }

  private async InitGetCustomPluginsFromUser() {
    this.plugins.push(...globalThis.serverConfig.build.plugins);
  }

  async getEntryPoints() {
    const { baseDir, hydrate, pageDir } = this.options;

    let entrypoints = [join(baseDir, hydrate)];
    const absPageDir = join(baseDir, pageDir as string);
    for await (const path of this.glob(absPageDir, "**/*.{tsx,jsx}")) {
      entrypoints.push(path);
    }
    entrypoints = entrypoints.filter((e) => {
      const allowedEndsWith = ["hydrate.ts", "layout.tsx", "index.tsx", "loading.tsx", "error.tsx"];
      if (
        allowedEndsWith.includes(e.split("/").at(-1) as string) ||
        /\[[A-Za-z0-9]+\]\.[A-Za-z]sx/.test(e)
      )
        return true;
      return false;
    });

    return entrypoints;
  }
  /**
   *
   * @param fromPath the current path to get the layout entry points from
   * @returns absolute paths of layouts
   */
  async getLayoutEntryPoints(fromPath?: string) {
    const { baseDir, pageDir } = this.options;

    const layoutsPaths = router.layoutPaths;
    const pathFromPageDir = fromPath?.split(pageDir).at(1);

    if (pathFromPageDir) {
      const cwd = process.cwd();
      const layoutPathsFromCurrentPath = layoutsPaths
        .map((path) => normalize(path.replace("layout.tsx", "")))
        .filter((e) => pathFromPageDir.startsWith(e))
        .map((path) => join(cwd, pageDir, path, "layout.tsx"));
      return layoutPathsFromCurrentPath;
    }

    let entrypoints = [];
    const absPageDir = join(baseDir, pageDir as string);
    for await (const path of this.glob(absPageDir)) {
      entrypoints.push(path);
    }
    entrypoints = entrypoints.filter((e) => {
      const allowedEndsWith = ["layout.tsx"];
      if (allowedEndsWith.includes(e.split("/").at(-1) as string)) return true;
      return false;
    });
    return entrypoints;
  }

  async build(onlyPath?: string) {
    const { baseDir, hydrate, buildDir } = this.options;
    const pluginsConfig = await this.getPluginBuildConfig();
    const entrypoints =
      onlyPath && process.env.NODE_ENV == "development"
        ? [
          join(baseDir, hydrate),
          onlyPath,
          ...(await this.getLayoutEntryPoints(onlyPath)),
          ...(pluginsConfig?.entrypoints ?? []),
        ]
        : await this.getEntryPoints();
    const build = await Bun.build({
      env: Bun.semver.satisfies(Bun.version, "1.1.39 - x.x.x")
        ? "PUBLIC_*"
        : "*",
      minify: process.env.NODE_ENV == "production",
      sourcemap: "none",
      ...pluginsConfig,
      outdir: join(baseDir, buildDir as string),
      publicPath: "./",
      //@ts-ignore
      splitting: true,
      target: "browser",
      naming: {
        chunk: "chunk-[name]-[hash].[ext]"
      },
      entrypoints: [
        "react",
        "react-dom",
        "scheduler",
        "react-dom/client",
        "react/jsx-dev-runtime",
        ...entrypoints,
        ...(pluginsConfig?.entrypoints ?? []),
      ],
      plugins: [...this.plugins, ...(pluginsConfig?.plugins || [])],
      define: {
        "process.env.NODE_ENV": JSON.stringify(
          process.env.NODE_ENV
        ),
        ...pluginsConfig?.define,
      },
      external: [
        "bun",
        "node",
        "bun:sqlite",
        "crypto",
        "node:path",
        import.meta.filename,
        ...(pluginsConfig?.external || []),
      ],
    });
    this.cleanBuildDir(build);

    return build;
  }
  private async cleanBuildDir(buildOutput: BuildOutput) {
    for await (const file of this.glob(this.options.buildDir as string, "**")) {
      if (buildOutput.outputs.find((e) => e.path == file)) continue;
      else
        try {
          unlinkSync(file);
        } catch {
          console.error(`${file} not found for deletion`);
        }
    }
  }

  async updateData(data: BuildOuts) {
    this.revalidates = data.revalidates;
    const allBuildDirFilePaths = await Array.fromAsync(
      new Bun.Glob("**/*").scan({
        cwd: this.options.buildDir,
        onlyFiles: true,
        absolute: true,
        dot: true
      }));
    await Promise.all(
      pluginLoader.getSubPluginsByParentName("build_main", "after_build").map(async (after_build_main) => {
        try {
          await after_build_main.subPlugin(allBuildDirFilePaths);
        } catch (e) {
          console.error(`Error in build_main.after_build hook, name: ${after_build_main.name}:`, e);
        }
      })
    );
  }

  private createAwaiter() {
    const self = this;
    self.BuildWorkerAwaiter = new Promise<void>((resolve) => {
      self.BuildWorkerResolver = resolve;
    });
  }

  private createBuildWorker() {
    if (this.BuilderWorker || globalThis.__IS_BUILDER_WORKER__) return;
    this.BuilderWorker = this.makeBuildWorker();
    IPCManager.getInstanceForMain().setBuilderProcess(this.BuilderWorker);
  }

  private makeBuildWorker() {

    const self = this;
    return Bun.spawn({
      cmd: ["bun", join(import.meta.dirname, "build-worker.ts")],
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: process.env.NODE_ENV,
      },
      stdout: "inherit",
      stderr: "inherit",
      onExit: () => {
        self.BuilderWorker = undefined;
        IPCManager.getInstanceForCurrentProcess().setBuilderProcess(null);
      },
      ipc(_message) {
        const message = _message as BuildWorkerResponse;
        if (!message.type) return IPCManager.getInstanceForCurrentProcess().__DISPATCH__(_message);
        switch (message.type) {
          case "build":
            if (!message.success) {
              message.message && console.error(message.message);
              message.error && console.error(message.error);
              self.BuildWorkerResolver();
              break;
            }
            if (message.data) {
              self.updateData(message.data).then(() => {
                self.BuildWorkerResolver();
              });
              break;
            }
            break;
          case "log":
            message.message && console.info(message.message);
            message.error && console.error("Error From Build Worker: ", message.error);
            break;
        }
      },
    });
  }
  public awaitBuildFinish() {
    return this.BuildWorkerAwaiter;
  }
  async makeBuild(path?: string) {
    let strRes: BuildOuts | undefined;
    this.createBuildWorker();
    if (!this.BuilderWorker) throw new Error("BuilderWorker not found");
    await Promise.all(
      pluginLoader.getSubPluginsByParentName("build_main", "before_build").map(async (before_build_main) => {
        try {
          await before_build_main.subPlugin();
        } catch (e) {
          console.error(`Error in build_main.before_build hook, name: ${before_build_main.name}:`, e);
        }
      })
    );
    await this.awaitBuildFinish();
    this.createAwaiter();
    this.BuilderWorker.send({
      type: "build",
      BuildPath: path,
    } as BuildWorkerMessage);
    await this.awaitBuildFinish();
    if (this.BuilderWorker.exitCode) {
      this.createBuildWorker();
    }
    strRes = {
      revalidates: this.revalidates,
    };

    return strRes;
  }

  public glob(
    path: string,
    pattern = "**/*.{ts,tsx,js,jsx}"
  ): AsyncIterableIterator<string> {
    const glob = new Bun.Glob(pattern);
    return glob.scan({ cwd: path, onlyFiles: true, absolute: true });
  }
  public escapeRegExp(string: string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // $& means the whole matched string
  }
}


declare global {
  var __BUILDER__: Builder;
}

globalThis.__BUILDER__ ??= new Builder();

const builder = globalThis.__BUILDER__;

export { builder };
