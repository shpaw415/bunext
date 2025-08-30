"server only";

import "./server_global.ts";
import "./bunext_global";
import { join } from "node:path";
import {
  type BuildOutput,
  type BunPlugin,
} from "bun";
import { normalize } from "path";
import { mkdirSync, rmSync, unlinkSync } from "node:fs";
import "../globals";
import { Head } from "public/head";
import { DevConsole } from "./logs";
import { router } from "./router";
import * as React from "react";

import { PluginLoader } from "./plugin-loader.ts";
import type {
  BuildWorkerMessage,
  BuildWorkerResponse,
} from "./build-worker.ts";

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

declare global {
  var __BUNEXT_BUILD_PROCESS__:
    | Bun.Subprocess<"ignore", "inherit", "inherit">
    | undefined;
}

const cwd = process.cwd();

class Builder extends PluginLoader {
  public options: _Mainoptions = {
    pageDir: join("src", "pages") as "src/pages",
    buildDir: join(".bunext", "build") as ".bunext/build",
    hydrate: join(".bunext", "react-ssr", "hydrate.ts") as ".bunext/react-ssr/hydrate.ts",
    baseDir: cwd,
  };
  public preBuildPaths: Array<string> = [];
  public plugins: BunPlugin[] = [];
  private BuildPluginsConfig: Partial<Bun.BuildConfig> = {};
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

  constructor() {
    super();
  }

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

  async Init() {
    if (this.inited) return this;
    this.inited = true;
    this.Check_remove_node_modules_files_path();
    await this.InitGetCustomPluginsFromUser();
    await this.initPlugins();
    this.remove_node_modules_files_path.push(
      ...this.getPluginByName("removeFromBuild").flatMap((p) => p ?? [])
    );
    try {
      this.InitGetPlugins();
    } catch (e) {
      console.error("Plugin has not loaded correctly!", (e as Error).stack);
    }
    return this;
  }

  private async InitGetPlugins() {
    const pluginsData = this.getPluginByName("build");

    const config = pluginsData
      .map((p) => p.buildOptions)
      .filter((p) => p != undefined);

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

    this.BuildPluginsConfig = {
      ...Object.assign({}, ...config),
      entrypoints,
      external,
      define,
      plugins,
    };
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
      const allowedEndsWith = ["hydrate.ts", "layout.tsx", "index.tsx", "loading.tsx"];
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

    const entrypoints =
      onlyPath && process.env.NODE_ENV == "development"
        ? [
          join(baseDir, hydrate),
          onlyPath,
          ...(await this.getLayoutEntryPoints(onlyPath)),
        ]
        : await this.getEntryPoints();
    const build = await Bun.build({
      env: Bun.semver.satisfies(Bun.version, "1.1.39 - x.x.x")
        ? "PUBLIC_*"
        : "*",
      minify: process.env.NODE_ENV == "production",
      sourcemap: "none",
      ...this.BuildPluginsConfig,
      outdir: join(baseDir, buildDir as string),
      splitting: true,
      publicPath: "./",
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
        ...(this.BuildPluginsConfig?.entrypoints ?? []),
      ],
      plugins: [...this.plugins, ...(this.BuildPluginsConfig?.plugins || [])],
      define: {
        "process.env.NODE_ENV": JSON.stringify(
          process.env.NODE_ENV
        ),
        ...this.BuildPluginsConfig.define,
      },
      external: [
        "bun",
        "node",
        "bun:sqlite",
        "crypto",
        "node:path",
        import.meta.filename,
        ...(this.BuildPluginsConfig?.external || []),
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
    globalThis.Server?.updateWorkerData();
    await Promise.all(
      this.getPluginByName("after_build_main").map((after_build_main) => after_build_main())
    );
  }

  private createAwaiter() {
    const self = this;
    self.BuildWorkerAwaiter = new Promise<void>((resolve) => {
      self.BuildWorkerResolver = resolve;
    });
  }

  private createBuildWorker() {
    if (process.env.NODE_ENV == "development") {
      if (!globalThis.__BUNEXT_BUILD_PROCESS__)
        globalThis.__BUNEXT_BUILD_PROCESS__ = this.makeBuildWorker();
      this.BuilderWorker = globalThis.__BUNEXT_BUILD_PROCESS__;
    }
    if (!this.BuilderWorker) this.BuilderWorker = this.makeBuildWorker();
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
        globalThis.__BUNEXT_BUILD_PROCESS__ = undefined;
      },
      ipc(_message) {
        const message = _message as BuildWorkerResponse;
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
      this.getPluginByName("before_build_main").map((before_build_main) => before_build_main())
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


const builder: Builder = Boolean(process.env.__INIT__)
  ? (undefined as any)
  : new Builder();
await builder.Init();

export { builder, Builder };
