import { Glob, Transpiler, fileURLToPath, pathToFileURL } from "bun";
import { unlink } from "node:fs/promises";
import { basename, join } from "node:path";
import type {
  BunFile,
  BunPlugin,
  Import,
  OnLoadArgs,
  OnLoadResult,
  ServeOptions,
} from "bun";
import { normalize, relative } from "path";
import { isValidElement } from "react";
import reactElementToJSXString from "react-element-to-jsx-string";
import { URLpaths } from "../bun-react-ssr/types";
import { isUseClient } from "../bun-react-ssr";

globalThis.pages ??= [];
globalThis.serverActions ??= [];

type _Builderoptions = {
  main: _Mainoptions;
  bypass?: _bypassOptions;
  display?: {
    nextjs: {
      layout: string;
    };
  };
  postProcess?: {
    PostProcessFixes?: PostProcessFix[];
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
export class Builder {
  private options: _Mainoptions;
  private bypassoptions: _bypassOptions;
  private postProcessFixes: PostProcessFix[];
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
    this.postProcessFixes = options.postProcess?.PostProcessFixes || [];
  }
  async build() {
    const { baseDir, hydrate, pageDir, sourcemap, buildDir, minify, plugins } =
      this.options;
    const entrypoints = [join(baseDir, hydrate)];
    const absPageDir = join(baseDir, pageDir as string);
    for await (const path of this.glob(absPageDir)) {
      entrypoints.push(path);
    }
    const result = await this.CreateBuild({
      entrypoints,
      sourcemap,
      outdir: join(baseDir, buildDir as string),
      minify,
      plugins: [...(plugins ?? [])],
    });
    if (result.success) {
      for await (const path of this.glob(join(baseDir, buildDir as string))) {
        if (result.outputs.every((x) => x.path !== path)) {
          await unlink(path);
        }
      }
    } else return result;

    return result;
  }
  resetPath(path: string) {
    const index = globalThis.pages.findIndex((p) => p.path === path);
    if (index == -1) return;
    globalThis.pages.splice(index, 1);
  }
  private async clearDuplicateExports(fileContent: string) {
    let exports = fileContent.matchAll(/export\s*\{([\s\S]*?)\}\s*;/g);
    let _export: { exportStr: string; exportValues: string[] }[] = [];
    for await (const i of exports) {
      _export.push({
        exportStr: i[0],
        exportValues: i[1]
          .replaceAll("\n", "")
          .split(",")
          .map((v) => v.trim()),
      });
    }
    if (_export.length <= 1) return fileContent;
    const filteredExports = [...new Set(..._export.map((e) => e.exportValues))];
    for await (const e of _export) {
      fileContent = fileContent.replaceAll(e.exportStr, "");
    }
    fileContent += `export {${filteredExports.join(", ")}};`;
    return fileContent;
  }

  private ServerActionPluginExt(
    func: Function,
    ModulePath: string,
    isDefault: boolean
  ): string | null {
    if (!func.name.startsWith("Server")) return null;
    const path = ModulePath.split(this.options.pageDir as string).at(1);
    if (!path) return null;

    return `export ${isDefault ? "default " : ""}async function ${
      func.name
    }${this.ServerActionClient(normalize(path), func.name)}`;
  }
  private ServerActionClient(ModulePath: string, funcName: string) {
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
  }
  private NextJsPlugin() {
    const self = this;
    return {
      name: "NextJsPlugin",
      target: "browser",
      setup(build) {
        build.onLoad(
          {
            filter: /\.ts[x]$/,
            namespace: "file",
          },
          async (props) => {
            const pageBasePath = props.path
              .split(self.options.pageDir as string)
              .at(1);
            const transpiler = new Transpiler({
              loader: "tsx",
              trimUnusedImports: true,
              target: "browser",
            });
            const content = await Bun.file(props.path).text();

            const relativePath = normalize(
              "/" + (pageBasePath?.split("/").slice(0, -1).join("/") || "")
            );

            if (
              globalThis.pages.find((e) => e.path === relativePath) &&
              pageBasePath
            ) {
              const { imports, exports } = transpiler.scan(content);
              const _content = [
                await self.importerV1({
                  imported: imports,
                  namespace: "noRevalidate",
                  props,
                }),
                await self.ServerExporter({
                  exports: exports,
                  props,
                  _module: await import(props.path),
                }),
              ].join("\n");
              return {
                contents: _content,
                loader: props.loader,
              };
            }

            ///////////////////////////////////////////////////////////////////
            let _return = {} as OnLoadResult;
            let compilerType = props.loader;
            const makeReturn = (content: string) => {
              _return = {
                contents: content,
                loader: compilerType,
              };
              return _return;
            };

            const { imports, exports } = transpiler.scan(content);
            const makeImport = async (namespace?: string) =>
              await self.importerV1({
                imported: imports,
                props: props,
                namespace,
              });
            const makeServerExport = async () =>
              await self.ServerExporter({
                exports: exports,
                _module: await import(props.path),
                props: props,
              });

            if (
              props.path.includes(self.options.pageDir as string) &&
              self.bypassoptions.useServer.pageName.includes(
                props.path.split("/").at(-1) || ""
              )
            )
              return makeReturn(content);

            const _isUseClient = isUseClient(content);
            const _isInPageDir = props.path.includes(
              self.options.pageDir as string
            );

            const makeFullServerFeature = async (namespace?: string) => {
              const parsedContent = [
                await makeImport(namespace),
                //await self.ContentWOExports(content),
                await makeServerExport(),
              ];
              return makeReturn(parsedContent.join("\n"));
            };
            const makeClientFeature = (content: string) => {
              const security = self.checkSecurityFeatures(
                content,
                props.loader as "tsx"
              );
              if (!security.passed) throw new Error(security.cause);
              return makeReturn(content);
            };

            if (_isInPageDir && !_isUseClient) {
              return await makeFullServerFeature();
            } else if (_isInPageDir && _isUseClient) {
              return makeClientFeature(content);
            } else if (!_isInPageDir && !isUseClient) {
              return makeReturn(content);
            } else if (!_isInPageDir && _isUseClient) {
              return makeClientFeature(content);
            }
          }
        );
        build.onResolve(
          {
            filter: /\.ts[x]\?noRevalidate$/,
          },
          async (args) => {
            const url = pathToFileURL(args.importer);
            const path = fileURLToPath(new URL(args.path, url));
            return {
              path: path,
              namespace: "noRevalidate",
            };
          }
        );
        build.onLoad(
          {
            filter: /\.ts[x]$/,
            namespace: "noRevalidate",
          },
          async ({ loader, path }) => {
            const transpiler = new Transpiler({
              loader: loader as "tsx" | "ts",
              deadCodeElimination: true,
              target: "browser",
              trimUnusedImports: true,
            });
            const fileContent = await Bun.file(path).text();

            const buildedPath = normalize(
              path
                .replace(
                  process.cwd(),
                  `${self.options.baseDir}/${self.options.buildDir as string}`
                )
                .replace(".tsx", ".js")
                .replace(".ts", ".js")
            );
            const buildFile = Bun.file(buildedPath);
            const contentWithoutImports = (await buildFile.text())
              .split("\n")
              .filter(
                (line) =>
                  !line.trim().startsWith("import") &&
                  !line.trim().startsWith("var jsx_dev_runtime = ")
              )
              .join("\n");
            const isUseInjection = self.isUseInjection(contentWithoutImports);
            const transpiled = transpiler.transformSync(contentWithoutImports);
            await Bun.write(buildFile, transpiled);

            //const _module = await import(buildedPath);
            const newData = `${self
              .extractImports(fileContent, "tsx")
              .join("\n")}\n${
              isUseInjection ? '"use injection";' : ""
            }\n${transpiled}`;
            return {
              contents: newData,
              loader: "js",
            };
          }
        );
        build.onResolve(
          {
            filter: /\.tsx$/,
          },
          async ({ path }) => {
            let realPath: undefined | string;
            try {
              realPath = import.meta.resolveSync(
                path.split(".").at(0) as string
              );
            } catch {}
            return {
              path: realPath ?? path,
            };
          }
        );
        build.onResolve(
          {
            filter: /\.ts[x]\?importer$/,
          },
          async (args) => {
            const url = pathToFileURL(args.importer);
            const path = fileURLToPath(new URL(args.path, url));
            let _path: string | undefined = path;
            let external = false;
            if (!(await Bun.file(path).exists())) {
              external = true;
            } else if (path.includes(self.options.pageDir as string))
              _path = path;
            return {
              path: _path ?? args.path,
              external: external,
              namespace: "importer",
            };
          }
        );
        build.onLoad(
          {
            namespace: "importer",
            filter: /\.ts[x]$/,
          },
          async ({ path, loader, namespace }) => {
            let file = Bun.file(path);
            let realPath = path;
            if (!(await file.exists())) {
              realPath = import.meta.resolveSync(
                path.split(self.options.pageDir as string)[1].slice(1)
              );

              file = Bun.file(realPath);
            }
            let fileContent = await file.text();
            if (!isUseClient(fileContent)) {
              const makeImport = async (
                imports: Import[],
                _namespace?: string
              ) =>
                await self.importerV1({
                  imported: imports,
                  props: {
                    loader,
                    path,
                    namespace,
                  },
                  namespace: _namespace,
                });
              const makeServerExport = async (exportes: any) =>
                await self.ServerExporter({
                  exports: exportes,
                  _module: await import(realPath),
                  props: {
                    loader,
                    path,
                    namespace,
                  },
                });
              const { exports, imports } = new Transpiler({
                loader: "tsx",
              }).scan(fileContent);
              fileContent = [
                await self.ContentWOExports(fileContent),
                await makeImport(imports, namespace),
                await makeServerExport(exports),
              ].join("\n");
            }
            return {
              contents: fileContent,
              loader: path.endsWith("tsx") ? "tsx" : "ts",
            };
          }
        );
      },
    } as BunPlugin;
  }
  private ContentWOExports(content: string) {
    const transpiled = new Bun.Transpiler({
      target: "browser",
      loader: "tsx",
      deadCodeElimination: true,
      autoImportJSX: true,
      exports: {
        eliminate: [
          ...new Bun.Transpiler({ loader: "tsx" }).scan(content).exports,
        ],
      },
      trimUnusedImports: true,
      jsxOptimizationInline: true,
    }).transform(content);

    return transpiled;
  }
  private checkSecurityFeatures(
    content: string,
    loader: "ts" | "tsx"
  ): { passed: true } | { passed: false; cause: string } {
    const { exports } = new Transpiler({
      loader,
    }).scan(content);
    if (exports.includes("getServerSideProps"))
      return {
        passed: false,
        cause:
          "getServerSideProps cannot be in a use client context for security reason",
      };

    return {
      passed: true,
    };
  }
  private extractImports(moduleText: string, loader: "tsx" | "ts") {
    return this._extracImports(moduleText, loader).map((m) => m[0]);
  }
  private _extracImports(moduleText: string, loader: "tsx" | "ts") {
    const transpiler = new Transpiler({ loader });
    moduleText = transpiler.transformSync(moduleText);
    const currly = /import\s*\{\s*[\s\S]*?\s*\}\s*from\s*["'].*?["'];?/g;
    const wildas = /import\s*\*\s*as\s*\w+\s*from\s*["'].*?["'];?/g;
    return [...moduleText.matchAll(currly), ...moduleText.matchAll(wildas)];
  }
  private async ServerExporter({
    exports,
    _module,
    props,
  }: {
    exports: string[];
    _module: { [key: string]: Function };
    props: OnLoadArgs;
  }) {
    let _content = "";

    for await (const i of exports) {
      if (this.bypassoptions.useServer.functionName.includes(i)) continue;
      const exportName = i === "default" ? _module[i].name : i;

      const reactInjection = `var jsx_dev_runtime = __toESM(require_jsx_dev_runtime(), 1);\n`;

      const functionStr = (_module[i].toString() as string).trim();
      const noParamsFunctionStr = `function ${exportName}()`;
      const serverActionString = this.ServerActionPluginExt(
        _module[i],
        props.path,
        _module[i].name === _module?.default?.name
      );
      if (serverActionString) {
        _content += serverActionString + "\n";
        continue;
      }

      if (!functionStr.startsWith(noParamsFunctionStr)) {
        const newContent = `"use injection";\n${reactInjection}\nexport${
          _module[i].name === _module?.default?.name ? " default " : " "
        }${_module[i]
          .toString()
          .replaceAll("jsxDEV", "jsx_dev_runtime.jsxDEV")}`;
        _content += newContent;
        continue;
      }
      const element = (await _module[i]()) as JSX.Element;
      if (!isValidElement(element)) continue;
      const jsxString = reactElementToJSXString(element, {
        showFunctions: true,
        showDefaultProps: true,
      });
      _content += `export ${i === "default" ? "default " : ""}function ${
        i === "default" ? _module[i].name : i
      }(){ return ${jsxString};}\n`;
      break;
    }
    return _content;
  }
  private async importerV1({
    imported,
    props,
    namespace,
  }: {
    imported: Import[];
    props: OnLoadArgs;
    namespace?: string;
  }) {
    const transpiler = new Transpiler({
      loader: "tsx",
      trimUnusedImports: true,
      target: "browser",
    });

    const bypassImports = ["bun", "fs", "crypto", "node:crypto"];
    let _content = "";
    if (namespace) namespace = "?" + namespace;
    for await (const i of imported) {
      if (bypassImports.includes(i.path)) continue;
      let _modulePath: string = "";
      try {
        _modulePath = import.meta.resolveSync(
          normalize(`${props.path.split("/").slice(0, -1).join("/")}/${i.path}`)
        );
      } catch {
        _modulePath = import.meta.resolveSync(i.path);
      }
      const _module = transpiler.scan(await Bun.file(_modulePath).text());
      const _default = import.meta.require(_modulePath);

      const defaultName =
        typeof _default?.default?.name === "undefined"
          ? ""
          : _default.default.name;

      let bypassNameSpace: undefined | string;
      let _path = i.path;
      try {
        const path = import.meta.resolveSync(
          normalize(
            [props.path.split("/").slice(0, -1).join("/"), i.path].join("/")
          )
        );
      } catch {
        bypassNameSpace = "";
      }
      const newContent = `import { ${
        defaultName === "" ? "" : `default as ${defaultName},`
      } ${_module.exports
        .filter((e) => e !== "default")
        .join(", ")} } from "${_path}.tsx${
        typeof bypassNameSpace !== "undefined"
          ? bypassNameSpace
          : namespace ?? "?importer"
      }";\n`;
      _content += newContent;
    }
    return _content;
  }
  private async PackageJsonFindDependency(dependencyName: string) {
    const packageFile = (await Bun.file(
      `${process.cwd()}/package.json`
    ).json()) as {
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    if (
      packageFile.dependencies &&
      Object.keys(packageFile.dependencies).includes(dependencyName)
    )
      return true;
    if (
      packageFile.peerDependencies &&
      Object.keys(packageFile.peerDependencies).includes(dependencyName)
    )
      return true;
    return false;
  }
  private async CreateBuild(
    options: Partial<_Mainoptions> &
      _requiredBuildoptions &
      Partial<_otherOptions>
  ) {
    const { plugins, define } = this.options;
    const build = await Bun.build({
      ...options,
      publicPath: "./",
      plugins: [
        ...(plugins ?? []),
        ...(options.plugins ?? []),
        this.NextJsPlugin(),
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
    await this.makePostProcessing();
    return build;
  }
  private async makePostProcessing() {
    const builtFile = this.glob(
      normalize(`${this.options.baseDir}/${this.options.buildDir}`)
    );
    let buildFileArray = [];
    for await (const i of builtFile) {
      buildFileArray.push(i);
    }
    for await (const i of buildFileArray) {
      if (i.split("/").at(-1)?.startsWith("chunk-")) continue;
      const file = Bun.file(i);
      let content = await this.clearDuplicateExports(await file.text());
      for await (const fix of this.postProcessFixes) {
        if (!(await this.PackageJsonFindDependency(fix.packageName))) continue;
        content = await fix.modifier({
          fileContent: content,
          path: i,
        });
      }
      await Bun.write(file, content);
    }
  }
  private isUseInjection(buildFileContent: string) {
    return buildFileContent
      .split("\n")
      .find((line) => line.trim().startsWith('"bunext injected!";'))
      ? true
      : false;
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

/**
 * fix for library using special syntax
 * @param packageName package name found in package.json in dependencies
 */
export class PostProcessFix {
  public packageName: string;
  public modifier: ({
    fileContent,
    path,
  }: {
    fileContent: string;
    path: string;
  }) => Promise<string>;
  constructor(packageName: string, modifier: PostProcessFix["modifier"]) {
    this.packageName = packageName;
    this.modifier = modifier;
  }
}
