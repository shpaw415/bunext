import { join, basename } from "node:path";
import type { BuildOutput, BunPlugin } from "bun";
import { normalize } from "path";
import { isValidElement } from "react";
import reactElementToJSXString from "react-element-to-jsx-string";
import { URLpaths } from "./types";
import { unlinkSync } from "node:fs";
import "./server_global";
import { type JsxElement } from "typescript";
import { renderToString } from "react-dom/server";
import type { ssrElement } from "./types";
import { exitCodes } from "./globals";
import { Head, type _Head } from "../features/head";

type BuildOuts = {
  ssrElement: ssrElement[];
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
  buildDir?: string;
  pageDir?: string;
  hydrate: string;
  sourcemap?: "external" | "none" | "inline";
  minify?: boolean;
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
  public ssrElement: ssrElement[] = [];
  public revalidates: {
    path: string;
    time: number;
  }[] = [];

  private currentRecursivePreBuildsPages: string[] = [];

  constructor(baseDir: string) {
    this.options = {
      minify: Bun.env.NODE_ENV === "production",
      pageDir: "src/pages",
      buildDir: ".bunext/build",
      hydrate: ".bunext/react-ssr/hydrate.ts",
      baseDir,
    };
  }

  async Init() {
    await this.InitGetCustomPluginsFromUser();
    await this.InitGetFixingPlugins();
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
      .default;
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
        const allowedEndsWith = [
          "hydrate.ts",
          "layout.tsx",
          "index.tsx",
          "[id].tsx",
        ];
        if (allowedEndsWith.includes(e.split("/").at(-1) as string))
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
    for await (const file of this.glob(
      this.options.buildDir as string,
      "**/*.js"
    )) {
      if (this.buildOutput.outputs.find((e) => e.path == file)) continue;
      else
        try {
          unlinkSync(file);
        } catch {}
    }
    //await this.afterBuild();
    process.env.__BUILD_MODE__ = "false";
    return this.buildOutput;
  }
  async preBuild(modulePath: string) {
    Head._setCurrentPath(modulePath);
    const moduleContent = await Bun.file(modulePath).text();
    const _module = await import(modulePath);
    const isServer = !this.isUseClient(moduleContent);
    const { exports, imports } = new Bun.Transpiler({ loader: "tsx" }).scan(
      moduleContent
    );

    //TODO: need to test for revalidation of imported react Element from current page
    if (modulePath.endsWith("index.tsx")) {
      const MainModulePath = import.meta
        .resolve(modulePath)
        .replace("file://", "");
      this.currentRecursivePreBuildsPages.push(MainModulePath);
      const ext = "tsx";
      for await (const imp of imports) {
        const filePath =
          import.meta.resolve(imp.path, modulePath).replace("file://", "") +
          `.${ext}`;
        if (!(await Bun.file(filePath).exists())) continue;
        if (this.currentRecursivePreBuildsPages.includes(filePath)) continue;
        else {
          this.currentRecursivePreBuildsPages.push(filePath);
          this.resetPath(filePath);
          this.preBuild(filePath);
        }
      }
    }

    if (!isServer) return;
    const EmptyParamsFunctionRegex = /\b\w+\s*\(\s*\)/;
    for await (const ex of exports) {
      const exported = _module[ex] as Function | unknown;
      if (typeof exported != "function" || exported.name.startsWith("Server"))
        continue;
      const FuncString = exported.toString();
      if (!FuncString.match(EmptyParamsFunctionRegex)) continue;
      let element: JsxElement | any = undefined;
      try {
        element = await exported();
      } catch (e) {
        console.log(e);
      }
      if (!isValidElement(element)) continue;
      const findModule = (e: any) => e.path == modulePath;
      let moduleSSR = this.ssrElement.find(findModule);
      if (!moduleSSR) {
        this.ssrElement.push({
          path: import.meta.resolve(modulePath).replace("file://", ""),
          elements: [],
        });
        moduleSSR = this.ssrElement.find(findModule);
      }
      if (!moduleSSR) throw new Error();
      const SSRelement = moduleSSR.elements.find(
        (e) => e.tag == `<!Bunext_Element_${exported.name}!>`
      );

      const toJSX = (el: React.ReactNode) =>
        reactElementToJSXString(el, {
          showFunctions: true,
        });
      if (SSRelement) {
        SSRelement.reactElement = toJSX(element);
        SSRelement.htmlElement = renderToString(element);
      } else {
        moduleSSR.elements.push({
          tag: `<!Bunext_Element_${exported.name}!>`,
          reactElement: toJSX(element),
          htmlElement: renderToString(element),
        });
      }
    }

    const tryier = (tests: Array<() => string | Error>) => {
      for (const i of tests) {
        try {
          const res = i();
          if (typeof res != "string") throw res;
          return res as string;
        } catch (e) {}
      }
      throw new Error("tryier cannot succeed");
    };

    for await (const imported of imports) {
      const isDot = imported.path == ".";
      let path = "";
      try {
        path = tryier([
          () =>
            isDot
              ? new Error()
              : import.meta
                  .resolve(imported.path, process.env.PWD)
                  .replace("file://", ""),
          () =>
            isDot
              ? new Error()
              : import.meta
                  .resolve(
                    normalize(
                      [
                        ...modulePath.split("/").slice(0, -1),
                        imported.path,
                      ].join("/")
                    )
                  )
                  .replace("file://", ""),
          () =>
            isDot
              ? new Error()
              : import.meta.resolve(imported.path).replace("file://", ""),
        ]);
      } catch (e) {
        throw new Error(
          import.meta
            .resolve(imported.path, process.env.PWD)
            .replace("file://", "")
        );
      }

      if (!path.endsWith(".tsx")) continue;
      if (this.preBuildPaths.includes(path)) continue;
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
  resetPath(path: string) {
    const index = this.ssrElement.findIndex((p) => p.path == path);
    if (index == -1) return;
    this.ssrElement.splice(index, 1);
    return index;
  }
  findPathIndex(path: string) {
    return this.ssrElement.findIndex((p) => p.path === path);
  }

  private async _makeBuild() {
    const ssrElements: ssrElement[] = JSON.parse(
      process.env.ssrElement || "[]"
    );
    const BuildPath: string | undefined = process.env.BuildPath;
    try {
      BuildPath
        ? await this.preBuild(BuildPath)
        : await this.preBuildAll(ssrElements);
      const output = await builder.build(BuildPath);
      if (!output.success) throw new Error(JSON.stringify(output));
    } catch (e: any) {
      console.log("Build Error");
      console.log(e);
      process.exitCode = exitCodes.build;

      if (process.send)
        process.send(
          JSON.stringify({
            type: "error",
            error: e,
          })
        );

      process.exit(exitCodes.build);
    }

    const data = {
      ssrElement: this.ssrElement,
      revalidates: this.revalidates,
      head: Head.head,
      type: "build",
    };

    if (process.send) process.send(JSON.stringify(data));

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
        ssrElement: JSON.stringify(this.ssrElement || []),
        BuildPath: path,
        __BUILD_MODE__: "true",
      },
      stdout: "inherit",
      ipc(message) {
        const data = JSON.parse(message) as procIPCdata;

        switch (data.type) {
          case "build":
            strRes = {
              ssrElement: data.ssrElement,
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
    this.ssrElement = strRes?.ssrElement || [];
    this.revalidates = strRes?.revalidates || [];
    Head.head = strRes?.head || {};
    return strRes as BuildOuts;
  }

  private ServerActionToClient(func: Function, ModulePath: string): string {
    const path = ModulePath.split(this.options.pageDir as string).at(
      1
    ) as string;

    const ServerActionClient = (ModulePath: string, funcName: string) => {
      return async function (...props: Array<any>) {
        function generateRandomString(length: number) {
          let result = "";
          const characters =
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
          const charactersLength = characters.length;

          for (let i = 0; i < length; i++) {
            result += characters.charAt(
              Math.floor(Math.random() * charactersLength)
            );
          }

          return result;
        }
        const formatToFile = () => `BUNEXT_FILE_${generateRandomString(10)}`;

        const formData = new FormData();

        let _props: Array<any> = props.map((prop) => {
          if (prop instanceof File) {
            const id = formatToFile();
            formData.append(id, prop);
            return id;
          } else return prop;
        });
        formData.append("props", encodeURI(JSON.stringify(_props)));

        const response = await fetch("<!URLPATH!>", {
          headers: {
            serverActionID: "<!ModulePath!>:<!FuncName!>",
          },
          method: "POST",
          body: formData,
        });
        if (!response.ok)
          throw new Error(
            "error when Calling server action <!ModulePath!>:<!FuncName!>"
          );
        const resObject = await response.json();

        __PUBLIC_SESSION_DATA__ = resObject.session;

        return resObject.props;
      }
        .toString()
        .replace("async function", "")
        .replaceAll("<!FuncName!>", funcName)
        .replaceAll("<!ModulePath!>", ModulePath)
        .replaceAll("<!URLPATH!>", URLpaths.serverAction);
    };

    return `async function ${func.name}${ServerActionClient(
      normalize(path),
      func.name
    )}`;
  }
  private async ClientSideFeatures(fileContent: string, filePath: string) {
    const transpiler = new Bun.Transpiler({
      loader: "tsx",
      autoImportJSX: true,
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
    serverComponants,
  }: {
    modulePath: string;
    fileContent: string;
    serverComponants: {
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
    fileContent = this.ServerComponantsCompiler(serverComponants, fileContent);

    return fileContent;
  }
  private ServerComponantsCompiler(
    serverComponants: {
      [key: string]: {
        tag: string; // "<!Bunext_Element_FunctionName!>"
        reactElement: string;
      };
    },
    fileContent: string
  ) {
    for (const _componant of Object.keys(serverComponants)) {
      const componant = (serverComponants as any)[_componant] as {
        tag: string;
        reactElement: string;
      };
      fileContent = fileContent.replace(
        `"${componant.tag}"`,
        `() => ${componant.reactElement}`
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
                    [self.options.baseDir, self.options.pageDir].join("/")
                  )
                ) +
                "/.*" +
                "\\.(ts|tsx|jsx)$"
            ),
          },
          async ({ path, loader, ...props }) => {
            const fileText = await Bun.file(path).text();
            const { exports } = new Bun.Transpiler({
              loader: loader as "tsx" | "ts",
            }).scan(fileText);
            return {
              contents:
                `export { ${exports.join(", ")} } from ` +
                JSON.stringify("./" + basename(path) + "?client"),
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
          async ({ path, loader }) => {
            let fileContent = await Bun.file(path).text();
            if (
              ["layout.tsx"]
                .map((endswith) => path.endsWith(endswith))
                .filter((t) => t == true).length > 0
            ) {
              return {
                contents: fileContent,
                loader: "tsx",
              };
            }
            const isServer = !self.isUseClient(fileContent);

            if (!isServer)
              return {
                contents: await self.ClientSideFeatures(fileContent, path),
                loader: "js",
              };

            let transpiler = new Bun.Transpiler({ loader: "tsx" });

            const serverComponants = isServer
              ? await self.ServerComponantsToTag(path)
              : {};
            const serverCompotantsForTranspiler = Object.assign(
              {},
              ...Object.keys(serverComponants).map((componant) => ({
                [componant]: serverComponants[componant].tag,
              }))
            );
            transpiler = new Bun.Transpiler({
              loader: "tsx",
              trimUnusedImports: true,
              exports: isServer
                ? {
                    replace: {
                      ...self.ServerActionToTag(fileContent),
                      ...serverCompotantsForTranspiler,
                    },
                  }
                : {},
            });
            fileContent = transpiler.transformSync(fileContent);
            if (isServer)
              fileContent = await self.ServerSideFeatures({
                modulePath: path,
                fileContent: fileContent,
                serverComponants: serverComponants,
              });

            fileContent = new Bun.Transpiler({
              loader: "tsx",
              autoImportJSX: true,
              trimUnusedImports: true,
              jsxOptimizationInline: true,
            }).transformSync(fileContent);
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
      },
    } as BunPlugin;
  }
  private SvgPlugin() {
    return {
      name: "SvgIntegrationPlugin",
      target: "browser",
      setup(build) {
        build.onLoad(
          {
            filter: /\.svg$/,
          },
          async (props) => {
            return {
              contents: `
              const Svg = () => ${await Bun.file(props.path).text()};
              export default Svg;
              `,
              loader: "jsx",
            };
          }
        );
      },
    } as BunPlugin;
  }
  private async ServerComponantsToTag(modulePath: string) {
    // ServerComponant
    const ssrModule = this.ssrElement.find((e) => e.path == modulePath);

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
      if (!this.isFunction(Func) || Func.name.startsWith("Server")) continue;
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
    const build = await Bun.build({
      ...options,
      publicPath: "./",
      plugins: [...this.plugins, this.NextJsPlugin(), this.SvgPlugin()],
      target: "browser",
      define: {
        "process.env.NODE_ENV": JSON.stringify(
          Bun.env.NODE_ENV || "development"
        ),
        ...define,
      },
      external: [
        "bun",
        "node",
        "bun:sqlite",
        import.meta.filename,
        "@bunpmjs/bunext/features/router.ts",
        "@bunpmjs/bunext/features/request.ts",
        "@bunpmjs/bunext/database/index.ts",
      ],
      splitting: true,
    });
    return build;
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

if (import.meta.main) await builder.makeBuild();

export { builder, Builder };
