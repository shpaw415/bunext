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
    baseDir: process.cwd(),
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
  ];

  private dev_remove_file_path = Boolean(process.env.__BUNEXT_DEV__)
    ? [
        `database/index.ts`,
        `internal/server/build.ts`,
        `internal/server/router.tsx`,
        `internal/server/bunextRequest.ts`,
        `database/class.ts`,
        `internal/session.ts`,
        `internal/caching/index.ts`,
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
      plugins: [
        this.NextJsPlugin(),
        ...this.plugins,
        ...(this.BuildPluginsConfig?.plugins || []),
      ],
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

  /**
   * this will set this.ssrElements & this.revalidates and make the build out from
   * a child process to avoid some error while building multiple time from the main process.
   */

  private ServerActionToClient(func: Function, ModulePath: string): string {
    const path = ModulePath.split(this.options.pageDir as string).at(
      1
    ) as string;

    const ServerActionClient = (ModulePath: string, funcName: string) => {
      return async function (...props: Array<any>) {
        return await globalThis.MakeServerActionRequest(props, "TARGET");
      }
        .toString()
        .replace("async function", "")
        .replace("TARGET", ModulePath + ":" + funcName);
    };

    return `async function ${func.name}${ServerActionClient(
      normalize(path),
      func.name
    )}`;
  }
  private async ClientSideFeatures(fileContent: string, filePath: string) {
    const transpiler = new Bun.Transpiler({
      loader: "tsx",
      deadCodeElimination: true,
      jsxOptimizationInline: true,
      exports: {
        replace: {
          ...this.ServerActionToTag(fileContent),
        },
      },
    });

    return this.ServerActionCompiler(
      (await import(filePath)) as Record<string, Function>,
      transpiler.transformSync(fileContent),
      filePath
    );
  }

  private async ServerSideFeatures({
    modulePath,
    fileContent,
    serverComponents,
  }: {
    modulePath: string;
    fileContent: string;
    serverComponents: {
      [key: string]: {
        tag: string; // "<!Bunext_Element_FunctionName!>"
        reactElement: string;
      };
    };
  }) {
    fileContent = this.ServerActionCompiler(
      (await import(modulePath)) as Record<string, Function>,
      fileContent,
      modulePath
    );
    fileContent = this.ServerComponentsCompiler(serverComponents, fileContent);

    return fileContent;
  }
  private ServerComponentsCompiler(
    serverComponents: {
      [key: string]: {
        tag: string; // "<!Bunext_Element_FunctionName!>"
        reactElement: string;
      };
    },
    fileContent: string
  ) {
    for (const _component of Object.keys(serverComponents)) {
      const component = serverComponents[_component] as {
        tag: string;
        reactElement: string;
      };

      fileContent = fileContent.replace(
        `"${component.tag}"`,
        `() => (${component.reactElement});`
      );
    }

    return fileContent;
  }
  private ServerActionCompiler(
    _module: Record<string, Function>,
    fileContent: string,
    modulePath: string
  ) {
    const ServerActionsExports = Object.keys(_module).filter(
      (k) =>
        k.startsWith("Server") ||
        (k == "default" && _module[k].name.startsWith("Server"))
    );
    // ServerAction
    for (const serverAction of ServerActionsExports) {
      const SAFunc = _module[serverAction] as Function;
      const SAString = SAFunc.toString();
      if (!SAString.startsWith("async")) continue;
      fileContent = fileContent.replace(
        `"<!BUNEXT_ServerAction_${serverAction}!>"`,
        this.ServerActionToClient(SAFunc, modulePath)
      );
    }

    return fileContent;
  }
  private NextJsPlugin() {
    const self = this;
    return {
      name: "NextJsPlugin",
      target: "browser",
      setup(build) {
        build.onLoad(
          {
            filter: new RegExp(
              "^" +
                self.escapeRegExp(
                  normalize(
                    join(self.options.baseDir, self.options.pageDir as string)
                  )
                ) +
                "/.*" +
                "\\.(ts|tsx|jsx)$"
            ),
          },
          async ({ path, loader, ...props }) => {
            const fileText = await Bun.file(path).text();
            const exports = new Bun.Transpiler({
              loader: loader as "tsx" | "ts",
              exports: {
                eliminate: ["getServerSideProps"],
              },
            }).scan(fileText).exports;

            return {
              contents: `export { ${exports.join(", ")} } from 
              ${JSON.stringify("./" + basename(path) + "?client")}`,
              loader: "ts",
            };
          }
        );
        build.onResolve(
          { filter: /\.(ts|tsx)\?client$/ },
          async ({ importer, path }) => {
            const url = Bun.pathToFileURL(importer);
            const filePath = Bun.fileURLToPath(new URL(path, url));
            return {
              path: filePath,
              namespace: "client",
            };
          }
        );
        build.onLoad(
          { namespace: "client", filter: /\.tsx$/ },
          async ({ path }) => {
            let fileContent = await Bun.file(path).text();
            if (
              ["layout.tsx"]
                .map((endsWith) => path.endsWith(endsWith))
                .filter((t) => t == true).length > 0
            ) {
              return {
                contents: fileContent,
                loader: "tsx",
              };
            }

            if (self.isUseClient(fileContent))
              return {
                contents: await self.ClientSideFeatures(fileContent, path),
                loader: "js",
              };

            const serverComponents = await self.ServerComponentsToTag(path);

            const serverComponentsForTranspiler = Object.assign(
              {},
              ...[
                ...Object.keys(serverComponents).map((component) => ({
                  [component]: serverComponents[component].tag,
                })),
              ]
            ) as Record<string, string>;

            const serverActionsTags = self.ServerActionToTag(fileContent);

            const transpiler = new Bun.Transpiler({
              loader: "tsx",
              exports: {
                replace: {
                  ...serverActionsTags,
                  ...serverComponentsForTranspiler,
                },
              },
            });
            fileContent = transpiler.transformSync(fileContent);
            fileContent = await self.ServerSideFeatures({
              modulePath: path,
              fileContent: fileContent,
              serverComponents: serverComponents,
            });

            fileContent = new Bun.Transpiler({
              loader: "jsx",
              jsxOptimizationInline: true,
              trimUnusedImports: true,
              treeShaking: true,
            }).transformSync(fileContent);

            for (const name of Object.keys(serverComponents))
              fileContent = fileContent.replace(
                `function ${name}()`,
                `function _${name}()`
              );

            return {
              contents: fileContent,
              loader: "js",
            };
          }
        );
        build.onLoad(
          { namespace: "client", filter: /\.ts$/ },
          async ({ path }) => {
            return {
              contents: await self.ClientSideFeatures(
                await Bun.file(path).text(),
                path
              ),
              loader: "js",
            };
          }
        );
        build.onLoad(
          {
            filter: new RegExp(
              "^" +
                self.escapeRegExp(normalize(self.options.baseDir)) +
                "/.*" +
                "\\.(ts|tsx|jsx)$"
            ),
          },
          async ({ path, loader }) => {
            const fileText = await Bun.file(path).text();
            const exports = new Bun.Transpiler({
              loader: loader as "tsx" | "ts",
            }).scan(fileText).exports;

            return {
              contents: `export { ${exports.join(", ")} } from 
              ${JSON.stringify("./" + basename(path) + "?module")}`,
              loader: "ts",
            };
          }
        );
        build.onResolve(
          { filter: /\.(ts|tsx)\?module$/ },
          async ({ importer, path }) => {
            const url = Bun.pathToFileURL(importer);
            const filePath = Bun.fileURLToPath(new URL(path, url));
            return {
              path: filePath,
              namespace: "module",
            };
          }
        );
        build.onLoad(
          { filter: /\.(ts|tsx)$/, namespace: "module" },
          async ({ path, loader }) => {
            if (
              self.remove_node_modules_files_path.includes(
                path.replace(self.options.baseDir + "/node_modules/", "")
              ) ||
              self.dev_remove_file_path.includes(path.replace(cwd + "/", ""))
            ) {
              return {
                contents: "",
                loader,
              };
            }

            return {
              contents: await Bun.file(path).text(),
              loader,
            };
          }
        );
      },
    } as BunPlugin;
  }

  private async ServerComponentsToTag(modulePath: string) {
    // ServerComponent
    const ssrModule = CacheManager.getSSR(modulePath);
    const _module = await import(modulePath);
    const defaultName = _module.default?.name as undefined | string;
    let replaceServerElement: {
      [key: string]: {
        tag: string;
        reactElement: string;
      };
    } = {};
    for await (const exported of Object.keys(_module)) {
      const Func = _module[exported] as Function;

      if (
        !this.isFunction(Func) ||
        Func.name.startsWith("Server") ||
        Func.name == "getServerSideProps" ||
        Func.length > 0
      ) {
        continue;
      }

      const ssrElement = ssrModule?.elements.find(
        (e) => e.tag == `<!Bunext_Element_${Func.name}!>`
      );

      if (!ssrElement) continue;
      if (defaultName == Func.name) replaceServerElement.default = ssrElement;
      else replaceServerElement[Func.name] = ssrElement;
    }
    return replaceServerElement;
  }
  /**
   * used for transform serverAction to tag for Transpiler
   */
  private ServerActionToTag(fileContent: string) {
    let transpiler = new Bun.Transpiler({ loader: "tsx" });
    const { exports } = transpiler.scan(fileContent);
    return exports
      .filter((ex) => ex.startsWith("Server"))
      .reduce(
        (a, ex) => ({
          ...a,
          [ex]: `<!BUNEXT_ServerAction_${ex}!>`,
        }),
        {}
      ) as { [key: string]: string };
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

  private isFunction(functionToCheck: any) {
    return typeof functionToCheck == "function";
  }
  private glob(
    path: string,
    pattern = "**/*.{ts,tsx,js,jsx}"
  ): AsyncIterableIterator<string> {
    const glob = new Bun.Glob(pattern);
    return glob.scan({ cwd: path, onlyFiles: true, absolute: true });
  }
  private escapeRegExp(string: string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // $& means the whole matched string
  }
}
const builder: Builder = Boolean(process.env.__INIT__)
  ? (undefined as any)
  : new Builder();
await builder.Init();
/*
if (import.meta.main) {
  await builder.makeBuild();
  process.exit(0);
}
  */

export { builder, Builder };
