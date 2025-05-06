import { Head } from "../../features/head";
import CacheManager from "../caching/index.ts";
import { builder, type BuildOuts } from "./build.ts";

export type BuildWorkerMessage = {
  type: "build";
  BuildPath?: string;
};
export type BuildWorkerResponse = {
  type: "build";
  success: boolean;
  data?: BuildOuts;
  error?: Error;
  message?: string;
};

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
}

async function build(
  BuildPath?: string
): Promise<Omit<BuildWorkerResponse, "type">> {
  try {
    BuildPath
      ? await builder.preBuild(BuildPath)
      : await builder.preBuildAll(CacheManager.getAllSSR());
  } catch (e) {
    return {
      success: false,
      error: e as Error,
      message: "Prebuild failed",
    };
  }
  try {
    const output = await builder.build(BuildPath);
    if (!output.success) {
      return {
        success: false,
        error: new Error(output.logs.join("\n")),
        message: "Build failed",
      };
    }
  } catch (e: any) {
    console.log(e);
    return {
      success: false,
      error: e,
      message: "Build failed",
    };
  }

  const data = {
    revalidates: builder.revalidates,
    head: Head.head,
  };

  return {
    success: true,
    data,
  };
}

if (import.meta.main) init();
