import { join, basename } from "node:path";
import { type BuildOutput, type BunPlugin, type JavaScriptLoader } from "bun";
import { normalize, resolve } from "path";
import { isValidElement, type JSX, type ReactNode } from "react";
import reactElementToJSXString from "./jsxToString/index";
import { unlinkSync } from "node:fs";
import "./server_global";
import { renderToString } from "react-dom/server";
import type { ssrElement, ServerConfig } from "./types";
import { exitCodes } from "./globals";
import { Head, type _Head } from "../features/head";
import fetchCache from "./caching/fetch";
import { BuildServerComponentWithHooksWarning } from "./logs";
import CacheManager from "./caching";

globalThis.React = await import("react");

type BuildOuts = {
  revalidates: {
    path: string;
    time: number;
  }[];
  head: Record<string, _Head>;
};

type procIPCdata =
  | ({
      type: "build";
    } & BuildOuts)
  | {
      type: "error";
      error: Error;
    };

type _Mainoptions = {
  baseDir: string;
  buildDir: string;
  pageDir: string;
  hydrate: string;
  sourcemap: "external" | "none" | "inline";
  minify: boolean;
  define?: Record<string, string>;
};

type _requiredBuildoptions = {
  outdir: string;
  entrypoints: string[];
};
type _otherOptions = {
  external: string[];
};

type _CreateBuild = Partial<_Mainoptions> &
  _requiredBuildoptions &
  Partial<_otherOptions>;

class Builder {
  public options: _Mainoptions;
  public preBuildPaths: Array<string> = [];
  private buildOutput?: BuildOutput;
  private plugins: BunPlugin[] = [];
  /**
   * absolute path
   */
  public revalidates: {
    path: string;
    time: number;
  }[] = [];

  public remove_node_modules_files_path = [
    "@bunpmjs/bunext/database/index.ts",
    "@bunpmjs/bunext/internal/build.ts",
    "@bunpmjs/bunext/internal/router.tsx",
    "@bunpmjs/bunext/internal/bunextRequest.ts",
    "@bunpmjs/json-webtoken/index.ts",
    "@bunpmjs/bunext/database/class.ts",
    "@bunpmjs/bunext/internal/session.ts",
  ];

  constructor(baseDir: string) {
    this.options = {
      minify: Bun.env.NODE_ENV === "production",
      sourcemap: "none",
      pageDir: "src/pages",
      buildDir: ".bunext/build",
      hydrate: ".bunext/react-ssr/hydrate.ts",
      baseDir,
    };
  }

  async Init() {
    await this.InitGetCustomPluginsFromUser();
    try {
      await this.InitGetFixingPlugins();
    } catch (e) {
      console.log("Plugin has not loaded correctly!\n", (e as Error).stack);
    }
    return this;
  }

  private async InitGetFixingPlugins() {
    const fixesFiles = await Array.fromAsync(
      this.glob(`${import.meta.dirname}/../plugins`, "**/*.ts")
    );
    for await (const filePath of fixesFiles) {
      const plugin = (await import(filePath))?.default;
      if (!plugin) continue;
      this.plugins.push(plugin);
    }
  }

  private async InitGetCustomPluginsFromUser() {
    const serverConfig = (await import(process.cwd() + "/config/server"))
      .default as ServerConfig;
    this.plugins.push(...serverConfig.build.plugins);
  }

  async build(onlyPath?: string) {
    process.env.__BUILD_MODE__ = "true";
    const { baseDir, hydrate, pageDir, sourcemap, buildDir, minify } =
      this.options;

    let entrypoints = [join(baseDir, hydrate)];

    if (!onlyPath) {
      const absPageDir = join(baseDir, pageDir as string);
      for await (const path of this.glob(absPageDir)) {
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
    } else {
      entrypoints.push(onlyPath);
    }
    this.buildOutput = await this.CreateBuild({
      entrypoints: entrypoints,
      sourcemap,
      outdir: join(baseDir, buildDir as string),
      minify,
    });
    this.cleanBuildDir(this.buildOutput);
    process.env.__BUILD_MODE__ = "false";
    return this.buildOutput;
  }
  private async cleanBuildDir(buildOutput: BuildOutput) {
    for await (const file of this.glob(
      this.options.buildDir as string,
      "**/*"
    )) {
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
    const _module = await import(modulePath);
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
  private toJSX(el: JSX.Element) {
    return reactElementToJSXString(el, {
      showFunctions: true,
      showDefaultProps: true,
      useFragmentShortSyntax: true,
      sortProps: false,
      useBooleanShorthandSyntax: false,
    });
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
          (await import.meta.resolve?.(imp)) || ""
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

  private async _makeBuild() {
    const BuildPath = process.env.BuildPath;

    try {
      BuildPath
        ? await this.preBuild(BuildPath)
        : await this.preBuildAll(CacheManager.getAllSSR());

      const output = await builder.build(BuildPath);
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
  /**
   * this will set this.ssrElements & this.revalidates and make the build out from
   * a child process to avoid some error while building multiple time from the main process.
   */
  async makeBuild(path?: string) {
    if (import.meta.main) return await this._makeBuild();
    let strRes: BuildOuts | undefined;
    const proc = Bun.spawn({
      cmd: ["bun", import.meta.filename],
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: process.env.NODE_ENV,
        BuildPath: path,
        __BUILD_MODE__: "true",
      },
      stdout: "inherit",
      stderr: "inherit",
      ipc(message) {
        const data = message as procIPCdata;
        switch (data.type) {
          case "build":
            strRes = {
              revalidates: data.revalidates,
              head: {
                ...data.head,
                ...Head.head,
              },
            };
            break;
          case "error":
            throw data.error;
        }
      },
    });
    const code = await proc.exited;
    if (code != 0) {
      console.log("Build exited with code", code);
      return;
    }
    this.revalidates = strRes?.revalidates || [];
    Head.head = strRes?.head || {};
    globalThis.Server?.updateWorkerData();
    return strRes as BuildOuts;
  }

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
                self.escapeRegExp(
                  normalize(join(self.options.baseDir, "node_modules"))
                ) +
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
              )
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

  private async CreateBuild(options: _CreateBuild) {
    const { define } = this.options;

    //@ts-ignore
    if (Bun.semver.satisfies(Bun.version, "1.1.39 - x.x.x") && !options.env) {
      //@ts-ignore
      options.env = "PUBLIC_*";
    }

    const build = await Bun.build({
      ...options,
      publicPath: "./",
      plugins: [this.NextJsPlugin(), ...this.plugins],
      target: "browser",
      define: {
        "process.env.NODE_ENV": JSON.stringify(
          process.env.NODE_ENV || "development"
        ),
        ...define,
      },
      external: [
        "bun",
        "node",
        "bun:sqlite",
        "crypto",
        "node:path",
        import.meta.filename,
        "@bunpmjs/bunext/features/router.ts",
        "@bunpmjs/bunext/features/request.ts",
      ],
      splitting: true,
    });
    await this.afterBuild(build);
    return build;
  }

  private async afterBuild(build: BuildOutput) {
    if (globalThis?.serverConfig?.experimental?.removeDuplicateExports) {
      Promise.all(
        build.outputs
          .map((b) => b.path)
          .filter((path) => path.endsWith("/index.js"))
          .map(this.removeDuplicateExports)
      );
    }
  }

  async removeDuplicateExports(filePath: string) {
    const file = Bun.file(filePath);
    let content = await file.text();
    const exportRegex = /export\s*(\*|\{[^}]*\})\s*from\s*['"]([^'"]+)['"];/g;
    const exports: string[] = [];

    let match;
    while ((match = exportRegex.exec(content)) !== null) {
      const exportStatement = match[0];
      const exportPath = match[2];
      if (!exports.includes(exportPath)) {
        exports.push(exportPath);
      }
    }

    exports.forEach((exportPath) => {
      const duplicateRegex = new RegExp(
        `export\\s*(\\*|\\{[^}]*\\})\\s*from\\s*['"]${exportPath}['"];`,
        "g"
      );
      content = content.replace(duplicateRegex, "");
    });

    await file.write(content);
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
const builder = await new Builder(process.cwd()).Init();

if (import.meta.main) {
  await builder.makeBuild();
  process.exit(0);
}

export { builder, Builder };
