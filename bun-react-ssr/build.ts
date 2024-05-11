import { Glob, fileURLToPath, pathToFileURL } from "bun";
import { join, basename } from "node:path";
import type { BuildOutput, BunPlugin } from "bun";
import { normalize } from "path";
import { isValidElement } from "react";
import reactElementToJSXString from "react-element-to-jsx-string";
import { URLpaths } from "../bun-react-ssr/types";
import { isUseClient } from "../bun-react-ssr";
import { unlink } from "node:fs/promises";
import "../internal/server_global";
import type { JsxElement } from "typescript";
import { BuildFix } from "../internal/buildFixes";
import { renderToString } from "react-dom/server";
import { generateRandomString } from "../features/utils";

type _Builderoptions = {
  main: _Mainoptions;
  bypass?: _bypassOptions;
  display?: {
    nextjs: {
      layout: string;
    };
  };
};

type _Mainoptions = {
  baseDir: string;
  buildDir?: string;
  pageDir?: string;
  hydrate: string;
  sourcemap?: "external" | "none" | "inline";
  minify?: boolean;
  define?: Record<string, string>;
  plugins?: import("bun").BunPlugin[];
};

type _bypassOptions = {
  useServer: {
    pageName: string[];
    functionName: string[];
  };
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

export class Builder {
  private options: _Mainoptions;
  private bypassoptions: _bypassOptions;
  static preBuildPaths: Array<string> = [];
  private buildOutput?: BuildOutput;
  constructor(options: _Builderoptions) {
    this.options = {
      minify: Bun.env.NODE_ENV === "production",
      pageDir: "pages",
      buildDir: ".build",
      ...options.main,
    };
    this.bypassoptions = {
      useServer: {
        pageName: [
          ...(options.display?.nextjs ? [options.display.nextjs.layout] : []),
          ...(options.bypass?.useServer.pageName ?? []),
        ],
        functionName: [
          "getServerSideProps",
          ...(options.bypass?.useServer.functionName ?? []),
        ],
      },
      ...options.bypass,
    };
  }
  async build() {
    const { baseDir, hydrate, pageDir, sourcemap, buildDir, minify, plugins } =
      this.options;
    let entrypoints = [join(baseDir, hydrate)];
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
      if (allowedEndsWith.includes(e.split("/").at(-1) as string)) return true;
      return false;
    });
    const result = await this.CreateBuild({
      entrypoints: entrypoints,
      sourcemap,
      outdir: join(baseDir, buildDir as string),
      minify,
      plugins: [...(plugins ?? [])],
    });
    const fileInBuildDir = await Array.fromAsync(
      this.glob(this.options.buildDir as string)
    );
    for await (const file of fileInBuildDir) {
      if (result.outputs.find((o) => o.path == file)) continue;
      else await unlink(file);
    }
    await this.afterBuild();
    return result;
  }
  private async setFileImportToBrowser(filePath: string) {
    const file = Bun.file(filePath);
    const res = BuildFix.convertImportsToBrowser(await file.text());
    await Bun.write(file, res);
  }
  // globalThis.ssrElement setting
  static async preBuild(modulePath: string) {
    const moduleContent = await Bun.file(modulePath).text();
    const _module = await import(modulePath);
    const isServer = !isUseClient(moduleContent);
    if (!isServer) return;
    const { exports, imports } = new Bun.Transpiler({ loader: "tsx" }).scan(
      moduleContent
    );
    const EmptyParamsFunctionRegex = /\b\w+\s*\(\s*\)/;
    for await (const ex of exports) {
      const exported = _module[ex] as Function | unknown;
      if (typeof exported != "function") continue;
      const FuncString = exported.toString();
      if (!FuncString.match(EmptyParamsFunctionRegex)) continue;
      const element = (await exported()) as JsxElement | any;
      if (!isValidElement(element)) continue;
      const findModule = (e: any) => e.path == modulePath;
      let moduleSSR = globalThis.ssrElement.find(findModule);
      if (!moduleSSR) {
        globalThis.ssrElement.push({
          path: import.meta.resolve(modulePath).replace("file://", ""),
          elements: [],
        });
        moduleSSR = globalThis.ssrElement.find(findModule);
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
      else this.preBuildPaths.push(path);
      await this.preBuild(path);
    }
  }
  resetPath(path: string) {
    const index = globalThis.pages.findIndex((p) => p.path === path);
    if (index == -1) return;
    globalThis.pages.splice(index, 1);
  }
  private ServerActionToClient(func: Function, ModulePath: string): string {
    const path = ModulePath.split(this.options.pageDir as string).at(
      1
    ) as string;

    const ServerActionClient = (ModulePath: string, funcName: string) => {
      return async function (...props: Array<any>) {
        const response = await fetch("<!URLPATH!>", {
          headers: {
            serverActionID: "<!ModulePath!>:<!FuncName!>",
          },
          method: "POST",
          body: JSON.stringify(encodeURI(JSON.stringify(props))),
        });
        if (!response.ok)
          throw new Error(
            "error when Calling server action <!ModulePath!>:<!FuncName!>"
          );
        return response.json();
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
  private ClientSideFeatures(fileContent: string, filePath: string) {
    const transpiler = new Bun.Transpiler({
      loader: "tsx",
      autoImportJSX: true,
      deadCodeElimination: true,
      jsxOptimizationInline: true,
    });
    return transpiler.transformSync(fileContent);
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
    const _module = (await import(modulePath)) as Record<string, Function>;
    const ServerActionsExports = Object.keys(_module).filter(
      (k) =>
        k.startsWith("Server") ||
        (k == "default" && _module[k].name.startsWith("Server"))
    );
    // ServerAction
    for await (const serverAction of ServerActionsExports) {
      const SAFunc = _module[serverAction] as Function;
      const SAString = SAFunc.toString();
      if (!SAString.startsWith("async")) continue;
      fileContent = fileContent.replace(
        `"<!BUNEXT_ServerAction_${serverAction}!>"`,
        this.ServerActionToClient(SAFunc, modulePath)
      );
    }
    // ServerComponants
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
                "\\.ts[x]$"
            ),
          },
          async ({ path, loader }) => {
            const search = new URLSearchParams();
            search.append("client", "1");
            search.append("loader", loader);
            const { exports } = new Bun.Transpiler({
              loader: "tsx",
            }).scan(await Bun.file(path).text());
            return {
              contents:
                `export { ${exports.join(", ")} } from ` +
                JSON.stringify("./" + basename(path) + "?client"),
              loader: "ts",
            };
          }
        );
        build.onResolve(
          { filter: /\.ts[x]\?client$/ },
          async ({ importer, path }) => {
            const url = pathToFileURL(importer);
            const filePath = fileURLToPath(new URL(path, url));
            return {
              path: filePath,
              namespace: "client",
            };
          }
        );
        build.onLoad(
          { namespace: "client", filter: /\.ts[x]$/ },
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
            const isServer = !isUseClient(fileContent);

            if (!isServer)
              return {
                contents: self.ClientSideFeatures(fileContent, path),
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
    const ssrModule = globalThis.ssrElement.find((e) => e.path == modulePath);

    const _module = await import(modulePath);
    const defaultName = _module.default?.name as undefined | string;
    const regex = /\b\w+\s*\(\s*\)/;
    let replaceServerElement: {
      [key: string]: {
        tag: string;
        reactElement: string;
      };
    } = {};
    for await (const exported of Object.keys(_module)) {
      const Func = _module[exported] as Function;
      if (!this.isFunction(Func)) continue;
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
    const { plugins, define } = this.options;
    const build = await Bun.build({
      ...options,
      publicPath: "./",
      plugins: [
        ...(plugins ?? []),
        ...(options.plugins ?? []),
        this.NextJsPlugin(),
        this.SvgPlugin(),
      ],
      target: "browser",
      define: {
        "process.env.NODE_ENV": JSON.stringify(
          Bun.env.NODE_ENV || "development"
        ),
        ...define,
      },
      splitting: true,
    });
    if (!build.success) return build;
    return build;
  }
  private async afterBuild() {
    for await (const i of globalThis.afterBuild) {
      await i({
        buildPath: this.options.buildDir as string,
        tmpPath: normalize([this.options.buildDir, "..", "tmp"].join("/")),
      });
    }

    if (process.env.NODE_ENV == "development") await this.afterBuildDev();
  }

  private async afterBuildDev() {
    if (!this.buildOutput) return;

    for await (const i of this.buildOutput.outputs) {
      const Path = i.path;
      const file = Bun.file(Path);
      let fileContent = await file.text();
      const imports = new Bun.Transpiler({ loader: "js" }).scanImports(
        fileContent
      );

      for (const imported of imports) {
        fileContent = fileContent.replace(
          imported.path,
          imported.path + "?" + generateRandomString(5)
        );
      }
      await Bun.write(file, fileContent);
    }
  }

  isFunction(functionToCheck: any) {
    return typeof functionToCheck == "function";
  }
  private glob(
    path: string,
    pattern = "**/*.{ts,tsx,js,jsx}"
  ): AsyncIterableIterator<string> {
    const glob = new Glob(pattern);
    return glob.scan({ cwd: path, onlyFiles: true, absolute: true });
  }
  private escapeRegExp(string: string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // $& means the whole matched string
  }
}
