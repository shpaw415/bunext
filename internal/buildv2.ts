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
  await builder.build(BuildPath);
} catch {
  process.exit(exitCodes.build);
}
process.stdout.write(
  JSON.stringify({
    ssrElement: globalThis.ssrElement,
    revalidates: globalThis.revalidates,
  })
);
process.exit(0);
