import { paths } from "./globals";
import type { ssrElement } from "./server_global";

type procIPCdata =
  | {
      type: "build";
      ssrElement: ssrElement[];
      revalidates: {
        path: string;
        time: number;
      }[];
    }
  | {
      type: "error";
      error: Error;
    };

type BuildOuts = {
  ssrElement: ssrElement[];
  revalidates: {
    path: string;
    time: number;
  }[];
};

export async function makeBuild(path?: string) {
  let strRes: BuildOuts | undefined;
  const proc = Bun.spawn({
    cmd: ["bun", `${paths.bunextModulePath}/internal/buildv2.ts`],
    env: {
      ...process.env,
      NODE_ENV: process.env.NODE_ENV,
      ssrElement: JSON.stringify(globalThis.ssrElement || []),
      BuildPath: path || undefined,
      __BUILD_MODE__: "true",
    },
    stdout: "ignore",
    ipc(message) {
      const data = JSON.parse(message) as procIPCdata;

      switch (data.type) {
        case "build":
          strRes = {
            ssrElement: data.ssrElement,
            revalidates: data.revalidates,
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
  globalThis.ssrElement = strRes?.ssrElement || [];
  return strRes as BuildOuts;
}

if (import.meta.main) makeBuild();
