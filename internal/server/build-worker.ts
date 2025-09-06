import { preBuild, preBuildAll, SSRCache } from "plugins/server-features/ssr-page";
import { builder, type BuildWorkerResponse, type ErrorObject } from "./build.ts";
import type { BuildOutput } from "bun";
import { pluginLoader } from "./plugin-loader"
import { initServerSide } from "./init";
import { IPCManager, type ClientIPCManager } from "plugins/utils";



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

let currentlyBuilding = false;

async function build(
  BuildPath?: string
): Promise<BuildWorkerResponse | null> {
  if (currentlyBuilding) return null;
  currentlyBuilding = true;
  try {
    BuildPath
      ? await preBuild(BuildPath)
      : await preBuildAll(await SSRCache.getAllSSR());
  } catch (e) {
    return {
      success: false,
      error: serializeError(e),
      message: "Prebuild failed",
    };
  }
  try {
    await beforeBuild();
    const output = await builder.build(BuildPath);
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


function serializeError(error: unknown, visited = new WeakSet()): ErrorObject {
  // Handle null/undefined or non-object inputs
  if (!error || typeof error !== 'object') {
    return {
      name: 'UnknownError',
      message: String(error ?? 'Unknown error occurred'),
      stack: undefined,
      cause: undefined,
    };
  }

  // Handle non-Error objects that might have error-like properties
  const errorObj = error as any;

  // Protect against circular references
  if (visited.has(errorObj)) {
    return {
      name: 'CircularReferenceError',
      message: 'Circular reference detected in error chain',
      stack: undefined,
      cause: undefined,
    };
  }

  visited.add(errorObj);

  let cause: ErrorObject["cause"] | undefined = undefined;

  // Handle error cause with better safety
  if (errorObj.cause !== undefined) {
    if (errorObj.cause instanceof Error || (errorObj.cause && typeof errorObj.cause === 'object')) {
      try {
        cause = serializeError(errorObj.cause, visited);
      } catch (causeError) {
        // If serializing the cause fails, create a fallback
        cause = {
          name: 'SerializationError',
          message: 'Failed to serialize error cause',
          stack: undefined,
          cause: undefined,
        };
      }
    } else {
      // For primitive cause values, safely convert to string
      try {
        cause = JSON.parse(JSON.stringify(errorObj.cause));
      } catch {
        cause = String(errorObj.cause);
      }
    }
  }

  return {
    name: errorObj.name || errorObj.constructor?.name || 'Error',
    message: String(errorObj.message || errorObj.toString?.() || 'No error message'),
    stack: typeof errorObj.stack === 'string' ? errorObj.stack : undefined,
    cause,
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


