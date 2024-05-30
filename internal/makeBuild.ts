import { paths } from "./globals";
import type { ssrElement } from "./server_global";

export async function makeBuild(path?: string) {
  const res = Bun.spawnSync({
    cmd: ["bun", `${paths.bunextModulePath}/internal/buildv2.ts`],
    env: {
      ...process.env,
      NODE_ENV: process.env.NODE_ENV,
      ssrElement: JSON.stringify(globalThis.ssrElement || []),
      BuildPath: path || undefined,
    },
  });
  const decoded = (await new Response(res.stdout).text()).split("<!BUNEXT!>");
  console.log(decoded[0]);
  try {
    const strRes = JSON.parse(decoded[1]) as {
      ssrElement: ssrElement[];
      revalidates: Array<{
        path: string;
        time: number;
      }>;
    };
    globalThis.ssrElement = strRes.ssrElement;
    return {
      revalidates: strRes.revalidates,
      error: false,
    };
  } catch {
    throw new Error(decoded[0]);
  }
}

if (import.meta.main) makeBuild();
