import type { ssrElement } from "./server_global";
import { builder } from "./build";
import "./server_global";
import { exitCodes } from "./globals";
import { Builder } from "../bun-react-ssr/build";

const ssrElements: ssrElement[] = JSON.parse(process.env.ssrElement || "[]");
const BuildPath: string | undefined = process.env.BuildPath;
try {
  BuildPath
    ? await Builder.preBuild(BuildPath)
    : await builder.preBuildAll(ssrElements);
  const output = await builder.build(BuildPath);
  if (!output.success) console.log(output);
} catch (e: any) {
  console.log("Build Error");
  console.log(e);
  process.exitCode = exitCodes.build;
  process.exit(exitCodes.build);
}

process.stdout.write(
  "<!BUNEXT!>" +
    JSON.stringify({
      ssrElement: globalThis.ssrElement,
      revalidates: globalThis.revalidates,
    })
);
process.exit(0);
