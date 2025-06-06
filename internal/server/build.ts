import "./server_global.ts";
import "./bunext_global";
import { join, basename } from "node:path";
import {
  type BuildConfig,
  type BuildOutput,
  type BunPlugin,
  type JavaScriptLoader,
} from "bun";
import { normalize, resolve } from "path";
import { isValidElement, type JSX, type ReactNode } from "react";
import reactElementToJSXString from "../jsxToString/index";
import { mkdirSync, rmSync, unlinkSync } from "node:fs";
import { renderToString } from "react-dom/server";
import type { ssrElement } from "../types";
import { exitCodes } from "../globals";
import { Head, type _Head } from "../../features/head";
import { BuildServerComponentWithHooksWarning } from "./logs";
import CacheManager from "../caching";
import { router } from "./router";
import * as React from "react";

import { PluginLoader } from "./plugin-loader.ts";
import type {
  BuildWorkerMessage,
  BuildWorkerResponse,
} from "./build-worker.ts";
import { generateRandomString } from "../../features/utils/index.ts";

globalThis.React = React;

export type BuildOuts = {
  revalidates: {
    path: string;
    time: number;
  }[];
  head: Record<string, _Head>;
};

type _Mainoptions = {
  baseDir: string;
  buildDir: string;
  pageDir: string;
  hydrate: string;
};

declare global {
  var __BUNEXT_BUILD_PROCESS__:
    | Bun.Subprocess<"ignore", "inherit", "inherit">
    | undefined;
}

const cwd = process.cwd();

class Builder extends PluginLoader {
  public options: _Mainoptions = {
    pageDir: "src/pages",
    buildDir: ".bunext/build",
    hydrate: ".bunext/react-ssr/hydrate.ts",
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
  private BuildWorkerResolver: () => void = () => {};

  public remove_node_modules_files_path = [
    "bunext-js/database/index.ts",
    "bunext-js/internal/server/build.ts",
    "bunext-js/internal/server/router.tsx",
    "bunext-js/internal/server/bunextRequest.ts",
    "@bunpmjs/json-webtoken/index.ts",
    "bunext-js/database/class.ts",
    "bunext-js/internal/session.ts",
    "bunext-js/internal/caching/index.ts",
    "bunext-js/internal/server/bunext_global.ts",
    "bunext-js/internal/server/server_global.ts",
    "bunext-js/database/bunext_object/server.ts",
    "bunext-js/features/request/bunext_object/server.ts",
    "bunext-js/plugins/image/index.ts",
  ];

  public dev_remove_file_path = Boolean(process.env.__BUNEXT_DEV__)
    ? [
        `database/index.ts`,
        `internal/server/build.ts`,
        `internal/server/router.tsx`,
        `internal/server/bunextRequest.ts`,
        `database/class.ts`,
        `internal/session.ts`,
        `internal/caching/index.ts`,
        "internal/server/server_global.ts",
        "database/bunext_object/server.ts",
        "features/request/bunext_object/server.ts",
        "plugins/image/index.ts",
      ]
    : [];

  constructor() {
    super();
  }

  clearBuildDir() {
    try {
      rmSync(this.options.buildDir as string, {
        recursive: true,
        force: true,
      });
    } catch {}
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
      ...this.getPlugins().flatMap((p) => p.removeFromBuild ?? [])
    );
    try {
      this.InitGetPlugins();
    } catch (e) {
      console.log("Plugin has not loaded correctly!\n", (e as Error).stack);
    }
    return this;
  }

  private async InitGetPlugins() {
    const pluginsData = this.getPlugins()
      .map((p) => p.build)
      .filter((p) => p != undefined);

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
      const allowedEndsWith = ["hydrate.ts", "layout.tsx", "index.tsx"];
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
        .map((path) => normalize(`${cwd}/${pageDir}/${path}/layout.tsx`));
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
    process.env.__BUILD_MODE__ = "true";
    const { baseDir, hydrate, buildDir, ...options } = this.options;

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
      minify: Bun.env.NODE_ENV == "production",
      sourcemap: "none",
      ...this.BuildPluginsConfig,
      outdir: join(baseDir, buildDir as string),
      splitting: true,
      publicPath: "./",
      target: "browser",
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
          process.env.NODE_ENV || "development"
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
        "bunext-js/features/router.ts",
        "bunext-js/features/request.ts",
        ...(this.BuildPluginsConfig?.external || []),
      ],
    });
    await this.afterBuild(build);

    this.cleanBuildDir(build);
    process.env.__BUILD_MODE__ = "false";

    return build;
  }
  private async cleanBuildDir(buildOutput: BuildOutput) {
    for await (const file of this.glob(this.options.buildDir as string, "**")) {
      if (buildOutput.outputs.find((e) => e.path == file)) continue;
      else
        try {
          unlinkSync(file);
        } catch {
          console.log(file, "not found for deletion");
        }
    }
  }
  async preBuild(modulePath: string) {
    Head._setCurrentPath(modulePath);
    const moduleContent = await Bun.file(modulePath).text();
    const _module = await import(
      modulePath +
        (process.env.NODE_ENV == "development"
          ? `?${generateRandomString(5)}`
          : "")
    );
    const isServer = !this.isUseClient(moduleContent);
    const { exports } = new Bun.Transpiler({ loader: "tsx" }).scan(
      moduleContent
    );
    if (!isServer) return;
    for await (const ex of exports) {
      const exported = _module[ex] as Function | unknown;
      if (
        typeof exported != "function" ||
        exported.name.startsWith("Server") ||
        exported.name == "getServerSideProps" ||
        exported.length > 0
      )
        continue;
      let element: ReactNode | undefined = undefined;
      try {
        element = await exported();
      } catch (e) {
        if (e instanceof Error) {
          if (e.message.startsWith("Cannot call a class constructor")) continue;
          console.log(e);
          if (
            e.message.startsWith(
              "null is not an object (evaluating 'dispatcher.use"
            )
          ) {
            console.log(BuildServerComponentWithHooksWarning);
          }
        }
      }
      if (!isValidElement(element)) continue;
      let moduleSSR =
        CacheManager.getSSR(modulePath) || CacheManager.addSSR(modulePath, []);
      const SSRelement = moduleSSR.elements.find(
        (e) => e.tag == `<!Bunext_Element_${exported.name}!>`
      );

      if (SSRelement) {
        SSRelement.reactElement = this.toJSX(element);
        SSRelement.htmlElement = renderToString(element as JSX.Element);
      } else {
        moduleSSR.elements.push({
          tag: `<!Bunext_Element_${exported.name}!>`,
          reactElement: this.toJSX(element),
          htmlElement: renderToString(element as JSX.Element),
        });
      }
      CacheManager.addSSR(modulePath, moduleSSR.elements);
    }
  }
  async preBuildAll(skip?: ssrElement[]) {
    const files = await Array.fromAsync(
      this.glob(
        normalize([this.options.baseDir, this.options.pageDir].join("/"))
      )
    );
    for await (const file of files) {
      if (skip?.find((e) => e.path == file)) continue;
      await this.preBuild(file);
    }
  }
  private toJSX(el: JSX.Element) {
    return reactElementToJSXString(el, {
      showFunctions: true,
      showDefaultProps: true,
      useFragmentShortSyntax: true,
      sortProps: false,
      useBooleanShorthandSyntax: false,
    });
  }

  isUseClient(fileData: string) {
    const line = fileData
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .at(0);
    if (!line) return false;
    if (line.startsWith("'use client'") || line.startsWith('"use client"'))
      return true;
    return false;
  }
  async resetPath(path: string) {
    const ssr = CacheManager.getSSR(path);
    if (!ssr) return false;
    if (process.env.NODE_ENV == "production") {
      const extensions = ["tsx", "jsx"];
      for (const imp of new Bun.Transpiler({
        loader: path.split(".").at(-1) as JavaScriptLoader,
      })
        .scanImports(await Bun.file(path).text())
        .map((e) => e.path)) {
        if (imp.startsWith(".")) {
          const _path = path.split("/");
          _path.pop();
          const resolvedPath = resolve(normalize("/" + join(..._path)), imp);
          for await (const ext of extensions) {
            const i = CacheManager.getSSR(`${resolvedPath}.${ext}`);
            if (i) CacheManager.deleteSSR(i.path);
          }
          continue;
        }
        const absolutePath = Bun.fileURLToPath(
          import.meta.resolve?.(imp) || ""
        );
        CacheManager.deleteSSR(absolutePath);
      }
    }
    CacheManager.deleteSSR(ssr.path);
    return true;
  }
  findPathIndex(path: string): boolean {
    return Boolean(CacheManager.getSSR(path));
  }

  private async _makeBuild(path?: string) {
    const BuildPath = path ?? process.env.BuildPath;

    try {
      BuildPath
        ? await this.preBuild(BuildPath)
        : await this.preBuildAll(CacheManager.getAllSSR());
    } catch (e) {
      console.log("PreBuild Error");

      if (process.send)
        process.send({
          type: "error",
          error: e,
        });
      process.exit(exitCodes.build);
    }
    try {
      const output = await this.build(BuildPath);
      if (!output.success) {
        console.log(output);
        throw new Error("Build Error");
      }
    } catch (e: any) {
      console.log("Build Error");
      console.log(e);
      process.exitCode = exitCodes.build;

      if (process.send)
        process.send({
          type: "error",
          error: e,
        });

      process.exit(exitCodes.build);
    }

    const data = {
      revalidates: this.revalidates,
      head: Head.head,
      type: "build",
    };

    if (process.send) process.send(data);

    return data as BuildOuts;
  }

  async updateData(data: BuildOuts) {
    this.revalidates = data.revalidates;
    Head.head = data.head;
    globalThis.Server?.updateWorkerData();
    await Promise.all(
      this.getPlugins().map(({ after_build_main }) => after_build_main?.())
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
        __BUILD_MODE__: "true",
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
              message.message && console.log(message.message);
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
    await Promise.all(
      this.getPlugins().map(({ before_build_main }) => before_build_main?.())
    );
    if (this.BuilderWorker) {
      await this.awaitBuildFinish();
      this.createAwaiter();
      this.BuilderWorker.send({
        type: "build",
        BuildPath: path,
      } as BuildWorkerMessage);
      await this.awaitBuildFinish();
      if (this.BuilderWorker.exitCode) {
        console.log("BuilderWorker exited");
        this.createBuildWorker();
      }
      strRes = {
        revalidates: this.revalidates,
        head: Head.head,
      };

      return strRes;
    } else {
      console.log(
        "BuilderWorker not found, using the main process to build.\nThis may cause some errors."
      );
      strRes = await this._makeBuild(path);
      if (strRes) {
        this.revalidates = strRes.revalidates;
        Head.head = strRes.head;
        this.updateData(strRes);
      }
      return strRes as BuildOuts;
    }
  }

  private async afterBuild(build: BuildOutput) {
    const afterBuildPlugins = this.getPlugins()
      .map((p) => p.after_build)
      .filter((p) => p != undefined);
    for await (const output of build.outputs) {
      for await (const plugin of afterBuildPlugins) {
        await plugin(output);
      }
    }
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
