"server only";

import "./server_global.ts";
import { join, normalize } from "node:path";
import {
  type BuildOutput,
  type BunPlugin,
} from "bun";
import { mkdirSync, rmSync, unlinkSync } from "node:fs";
import "../globals";
import { router } from "./router";
import * as React from "react";
import { pluginLoader } from "internal/server/plugin-loader.ts";
import { type ErrorObject, IPCManager } from "plugins/utils";
import type { BunextPlugin } from "plugins/types";

globalThis.React = React;

export type BuildOuts = {
  revalidates: {
    path: string;
    time: number;
  }[];
};


declare global {
  var __PLUGIN_CACHE__: {
    ts: Array<PluginCacheType<"ts">> | null;
    tsx: Array<PluginCacheType<"tsx">> | null;
    others: Array<PluginCacheType<"others">> | null;
  }
}

globalThis.__PLUGIN_CACHE__ ??= {
  ts: null,
  tsx: null,
  others: null,
};

type PluginCacheType<T extends "tsx" | "ts" | "others"> = {
  pluginName: string;
  func: Required<Required<Exclude<BunextPlugin["build"], undefined>>["partialPluginOverRide"]>[T];
};


export type BuildWorkerResponse = {
  success: boolean;
  data?: BuildOuts;
  error?: ErrorObject;
  message?: string;
};

type _Mainoptions = {
  baseDir: string;
  buildDir: ".bunext/build";
  pageDir: "src/pages";
  hydrate: ".bunext/react-ssr/hydrate.ts";
};

const cwd = process.cwd();
const ipc = IPCManager.getInstanceForCurrentProcess<"main">();

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

  public remove_node_modules_files_path: string[] = [];

  async init() {
    if (this.inited) return this;
    this.inited = true;
    this.Check_remove_node_modules_files_path();
    await this.InitGetCustomPluginsFromUser();
    /*this.createBuildWorker();*/

    this.remove_node_modules_files_path.push(
      ...pluginLoader.getPluginByName("removeFromBuild").flatMap((p) => p.pluginParent ?? [])
    );
    return this;
  }

  public async getEntryPoints() {
    const { baseDir, hydrate, pageDir } = this.options;

    let entrypoints = [join(baseDir, hydrate)];
    const absPageDir = join(baseDir, pageDir as string);
    for await (const path of this.glob(absPageDir, "**/*.{tsx,jsx}")) {
      entrypoints.push(path);
    }

    entrypoints = entrypoints.filter((e) => {
      const allowedEndsWith = ["hydrate.ts", "index.tsx"];
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
  public async getLayoutEntryPoints(fromPath?: string) {
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

  private beforeBuild() {
    return Promise.all(pluginLoader.getSubPluginsByParentName("build", "before_build").map(async (plugin) => {
      try {
        await plugin.subPlugin(ipc);
      } catch (e) {
        console.error(`Error in build.before_build hook, name: ${plugin.name}:`, e);
      }
    }));
  }

  private async afterBuild(build: BuildOutput) {
    const afterBuildPlugins = pluginLoader.getSubPluginsByParentName("build", "after_build");
    await Promise.all(afterBuildPlugins.map(async (plugin) => {
      try {
        await plugin.subPlugin(build, ipc);
      } catch (e) {
        console.error(`Error in build.after_build hook, name: ${plugin.name}:`, e);
      }
    }));
  }

  public async build(onlyPath?: string) {
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
    const minify = process.env.NODE_ENV == "production";
    await this.beforeBuild();
    const build = await Bun.build({
      env: "PUBLIC_*",
      minify,
      sourcemap: "none",
      ...pluginsConfig,
      outdir: join(baseDir, buildDir as string),
      publicPath: "./",
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
      plugins: [this.defaultPlugin(), ...this.plugins, ...(pluginsConfig?.plugins || [])],
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
    await this.afterBuild(build);

    return build;
  }

  private defaultPlugin(): BunPlugin {
    const self = this;

    const removeFromBuild = pluginLoader.getPluginByName("removeFromBuild").flatMap((p) => p.pluginParent ?? []).map((p) => normalize(p));
    return {
      name: "bunext-main-build-plugin",
      target: "browser",
      setup(build) {
        build.onLoad({ filter: self.pluginRegexMake({ path: ["src", "pages"], ext: ["tsx"] }) }, async (args) => {
          const { contents, loader } = await self.jsFileHandler({ args, fileExt: "tsx" });
          return { contents, loader: loader || args.loader };

        });
        build.onLoad({ filter: self.pluginRegexMake({ path: ["src", "pages"], ext: ["ts"] }) }, async (args) => {
          const { contents, loader } = await self.jsFileHandler({ args, fileExt: "ts" });
          return { contents, loader: loader || args.loader };
        });
        build.onLoad({ filter: self.pluginRegexMake({ path: [], ext: ["jsx", "tsx", "ts", "js"] }) }, async (args) => {
          if (removeFromBuild.some((p) => args.path === join(cwd, "node_modules", p))) {
            return self.returnEmptyFile("js", Object.keys(require(args.path)));
          }

          const { contents, loader } = await self.jsFileHandler({ args, fileExt: "others" });
          return { contents, loader: loader || args.loader };

        });
      }
    }
  }

  public clearBuildDir() {
    try {
      rmSync(this.options.buildDir, {
        recursive: true,
        force: true,
      });
    } catch { }
    mkdirSync(
      normalize(`${this.options.buildDir}/${this.options.pageDir}`),
      { recursive: true }
    );
  }

  private Check_remove_node_modules_files_path() {
    for (const path of this.remove_node_modules_files_path) {
      if (!import.meta.resolve(path))
        throw new Error(`${path} does not resolve`);
    }
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

  private getPluginInstance<T extends "tsx" | "ts" | "others">(fileExt: T): Array<PluginCacheType<T>> {

    if (globalThis.__PLUGIN_CACHE__[fileExt]) {
      return globalThis.__PLUGIN_CACHE__[fileExt] as Array<PluginCacheType<T>>;
    }

    const value = pluginLoader.getSubPluginsByParentName("build", "partialPluginOverRide")
      .map((p) => ({ pluginName: p.name, func: p.subPlugin[fileExt] }))
      .filter((p) => p.func !== undefined) as Array<PluginCacheType<T>>;
    globalThis.__PLUGIN_CACHE__[fileExt as "ts"] = value as Array<PluginCacheType<"ts">>;

    return globalThis.__PLUGIN_CACHE__[fileExt] as unknown as Array<PluginCacheType<T>>;
  }

  private async jsFileHandler({ args, fileExt }: { args: Bun.OnLoadArgs, fileExt: "tsx" | "ts" | "others" }): Promise<{ contents: string, loader?: Bun.Loader }> {
    if (await router.fileDirectives.pathIs("server-only", args.path)) {
      return this.returnEmptyFile("js", Object.keys(await import(args.path)));
    }

    let fileContents = await Bun.file(args.path).text();

    let loaderOverRide: Bun.Loader | undefined = undefined;
    for await (const { pluginName, func } of this.getPluginInstance(fileExt as "ts")) {
      try {
        const result = await func({ ...args, loader: loaderOverRide || args.loader }, fileContents, router.fileDirectives);
        const contents = await (result?.contents as unknown as Promise<string>);
        if (contents) {
          fileContents = contents;
        }
        if (result?.loader) {
          loaderOverRide = result.loader;
        }
      } catch (e) {
        console.error(`Error occurred while processing partialPluginOverride[${fileExt}] plugin ${pluginName}:`);
        throw e;
      }
    }

    return {
      contents: fileContents,
      loader: loaderOverRide,
    };
  }

  public pluginRegexMake({ path, ext }: { path: string[], ext: string[] }) {
    return new RegExp(`^${join(cwd, ...path).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*\\.(${ext.join("|")})$`)
  }
  /**
   * returns a module file that exports all exports as functions that throw an error when called from client side
   */
  returnEmptyFile(loader: Bun.Loader, exports: string[]) {
    const toErrorString = (e: string) => `throw new Error("[ ${e} ] This is server-only component and cannot be used in client-side.")`;
    return {
      contents: exports.map(
        (e) => {
          return e == "default" ? `export default function _default() { ${toErrorString("default")} };` : `export const ${e} = () => { ${toErrorString(e)} }`;
        }).join("\n"),
      loader,
    };
  }

  /*
  private createBuildWorker() {
    if (this.BuilderWorker || globalThis.__IS_BUILDER_WORKER__ || cluster.isWorker) return;
    this.BuilderWorker = this.makeBuildWorker();
    ipc.setBuilderProcess(this.BuilderWorker);
  }
    */
  /*
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
          ipc.setBuilderProcess(null);
        },
        ipc(_message) {
          ipc.__DISPATCH__(_message);
        },
      });
    }
      */

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
