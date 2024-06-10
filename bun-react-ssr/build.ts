import { join, basename } from "node:path";
import type { BuildOutput, BunPlugin } from "bun";
import { normalize } from "path";
import { isValidElement } from "react";
import reactElementToJSXString from "react-element-to-jsx-string";
import { URLpaths } from "../bun-react-ssr/types";
import { isUseClient } from "../bun-react-ssr";
import { unlinkSync } from "node:fs";
import "../internal/server_global";
import { type JsxElement } from "typescript";
import { renderToString } from "react-dom/server";
import type { ssrElement } from "../internal/server_global";
import { GetBuildFixFiles, type BuildFix } from "../internal/buildFixes";

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
  public options: _Mainoptions;
  static preBuildPaths: Array<string> = [];
  private buildOutput?: BuildOutput;
  private buildFixes: BuildFix[] = [];
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
    await this.InitBuildFix();
    return this;
  }

  async InitBuildFix() {
    const buildFixFiles = await GetBuildFixFiles();
    this.buildFixes = (
      (await Promise.all(buildFixFiles.map((f) => import(f)))) as {
        default?: BuildFix;
      }[]
    )
      .map((e) => e.default)
      .filter((e) => e != undefined);
  }

  async build(onlyPath?: string) {
    const { baseDir, hydrate, pageDir, sourcemap, buildDir, minify, plugins } =
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
      plugins: [
        ...(plugins ?? []),
        ...this.buildFixes.map((e) => e.plugin).filter((e) => e != undefined),
      ],
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
    await this.afterBuild();

    return this.buildOutput;
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
      if (typeof exported != "function" || exported.name.startsWith("Server"))
        continue;
      const FuncString = exported.toString();
      if (!FuncString.match(EmptyParamsFunctionRegex)) continue;
      let element: JsxElement | any = undefined;
      try {
        element = await exported();
      } catch (e) {
        //console.log(e);
      }
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
  async preBuildAll(skip?: ssrElement[]) {
    const files = await Array.fromAsync(
      this.glob(
        normalize([this.options.baseDir, this.options.pageDir].join("/"))
      )
    );
    for await (const file of files) {
      if (skip?.find((e) => e.path == file)) continue;
      await Builder.preBuild(file);
    }
  }
  resetPath(path: string) {
    const index = globalThis.ssrElement.findIndex((p) => p.path === path);
    if (index == -1) return;
    globalThis.ssrElement.splice(index, 1);
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
            const url = Bun.pathToFileURL(importer);
            const filePath = Bun.fileURLToPath(new URL(path, url));
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
      external: ["bun:sqlite", "bun"],
      splitting: true,
    });
    return build;
  }
  private async afterBuild() {
    for await (const i of this.buildFixes) {
      if (!i.afterBuildCallback) return;
      await i.afterBuildCallback({
        buildPath: this.options.buildDir as string,
        tmpPath: normalize([this.options.buildDir, "..", "tmp"].join("/")),
        outputs: this.buildOutput as BuildOutput,
        builder: this,
      });
    }
  }

  isFunction(functionToCheck: any) {
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
