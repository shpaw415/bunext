import { preBuild, preBuildAll, SSRCache } from "plugins/server-features/ssr-page";
import { builder, type BuildOuts } from "./build.ts";
import type { BuildOutput } from "bun";


await Promise.all(builder.getSubPluginsByParentName("build_worker", "start").map((onBuilderWorker) => onBuilderWorker()));

export type BuildWorkerMessage = {
  type: "build";
  BuildPath?: string;
};
export type BuildWorkerResponse = {
  type: "build" | "log";
  success: boolean;
  data?: BuildOuts;
  error?: Error;
  message?: string;
};

function Log(message: string | Object, error?: Error) {
  process.send?.({
    type: "log",
    message:
      typeof message === "string"
        ? message
        : JSON.stringify(message, null, 2),
    error
  } as BuildWorkerResponse);
}


function init() {
  process.on("message", async (_message) => {
    const message = _message as BuildWorkerMessage;
    if (message.type == "build") {
      const result = await build(message.BuildPath);
      process.send?.({
        type: "build",
        ...result,
      } as BuildWorkerResponse);
    }
  });
  process.on("disconnect", () => process.exit(0))
}

async function build(
  BuildPath?: string
): Promise<Omit<BuildWorkerResponse, "type">> {
  try {
    BuildPath
      ? await preBuild(BuildPath)
      : await preBuildAll(await SSRCache.getAllSSR());
  } catch (e) {
    return {
      success: false,
      error: e as Error,
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
        error: new Error(output.logs.join("\n")),
        message: "Build failed",
      };
    }
  } catch (e: any) {
    return {
      success: false,
      error: e,
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
  const afterBuildPlugins = builder.getSubPluginsByParentName("build_worker", "after_build");
  const awaiters: Promise<any>[] = [];
  for (const output of build.outputs) {
    awaiters.push(...afterBuildPlugins.map((plugin) => plugin(output)));
  }
  await Promise.all(awaiters);
}

function beforeBuild() {
  return Promise.all(builder.getSubPluginsByParentName("build_worker", "before_build").map((plugin) => plugin()));
}

if (import.meta.main) init();
