import { preBuild, preBuildAll, SSRCache } from "plugins/server-features/ssr-page";
import { builder, type BuildWorkerResponse } from "./build.ts";
import { type BuildOutput } from "bun";
import { pluginLoader } from "./plugin-loader"
import { initServerSide } from "./init";
import { IPCManager, type ClientIPCManager } from "plugins/utils";
import { serializeError } from "plugins/utils";
import { router } from "./router";


declare global {
  var __IS_BUILDER_WORKER__: boolean;
}

globalThis.__IS_BUILDER_WORKER__ = true;

await initServerSide();


const IPCHelper = IPCManager.getInstanceForCurrentProcess() as ClientIPCManager<"builder">;

await Promise.all(pluginLoader.getSubPluginsByParentName("serverStart", "build_worker").map(async (onBuilderWorker) => {
  try {
    await onBuilderWorker.subPlugin(IPCHelper);
  } catch (e) {
    console.error(`Error in build_worker start hook, name: ${onBuilderWorker.name}:`, e);
  }
}));

if (process.env.NODE_ENV === "development") {
  await Promise.all(pluginLoader.getSubPluginsByParentName("serverStart", "dev_build_worker").map(async (onBuilderWorker) => {
    try {
      await onBuilderWorker.subPlugin(IPCHelper);
    } catch (e) {
      console.error(`Error in dev_build_worker start hook, name: ${onBuilderWorker.name}:`, e);
    }
  }));
}


function init() {
  let isBuilding = false;
  IPCHelper.onMessage<{ buildPath?: string }, BuildWorkerResponse | null>("build", async (message) => {
    if (isBuilding) return null;
    isBuilding = true;
    const result = await build(message.buildPath);
    isBuilding = false;
    return result;
  });
  process.on("disconnect", () => process.exit(0))
}

async function build(
  pathname?: string
): Promise<BuildWorkerResponse | null> {
  const filePath = pathname ? router.server.match(pathname)?.filePath : undefined;
  if (pathname && !filePath) {
    return {
      success: false,
      error: serializeError(new Error("Route not found")),
      message: "Build failed",
    };
  }
  try {

    filePath
      ? await preBuild(filePath)
      : await preBuildAll(await SSRCache.getAllSSR());
  } catch (e) {
    return {
      success: false,
      error: serializeError(e as Error),
      message: "Prebuild failed",
    };
  }
  try {
    await beforeBuild();
    const output = await builder.build(filePath);
    await afterBuild(output);
    if (!output.success) {
      return {
        success: false,
        error: serializeError(new Error(output.logs.join("\n"))),
        message: "Build failed",
      };
    }
  } catch (e: any) {
    return {
      success: false,
      error: serializeError(e),
      message: "Build failed",
    };
  }

  const data = {
    revalidates: builder.revalidates,
  };

  return {
    success: true,
    data,
  };
}




async function afterBuild(build: BuildOutput) {
  const afterBuildPlugins = pluginLoader.getSubPluginsByParentName("build_worker", "after_build");
  await Promise.all(afterBuildPlugins.map(async (plugin) => {
    try {
      await plugin.subPlugin(build, IPCHelper);
    } catch (e) {
      console.error(`Error in build_worker after_build hook, name: ${plugin.name}:`, e);
    }
  }));
}

function beforeBuild() {
  return Promise.all(pluginLoader.getSubPluginsByParentName("build_worker", "before_build").map(async (plugin) => {
    try {
      await plugin.subPlugin(IPCHelper);
    } catch (e) {
      console.error(`Error in build_worker before_build hook, name: ${plugin.name}:`, e);
    }
  }));
}

if (!import.meta.main) throw new Error("This file should be run as a child process!");
init();


