import type { ssrElement } from "./server_global";
import "./server_global";
import { exitCodes } from "./globals";
import { builder } from "./build";

const ssrElements: ssrElement[] = JSON.parse(process.env.ssrElement || "[]");
const BuildPath: string | undefined = process.env.BuildPath;
try {
  BuildPath
    ? await builder.preBuild(BuildPath)
    : await builder.preBuildAll(ssrElements);
  const output = await builder.build(BuildPath);
  if (!output.success) console.log(output);
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
  ssrElement: globalThis.ssrElement,
  revalidates: globalThis.revalidates,
  type: "build",
};

if (process.send) process.send(JSON.stringify(data));

console.log(data);

process.exit(0);
