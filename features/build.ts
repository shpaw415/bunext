import { Builder } from "@bunpmjs/bunext/bun-react-ssr/build";

export const builder = new Builder({
  baseDir: process.cwd(),
  buildDir: ".bunext/build",
  pageDir: "src/pages",
  hydrate: ".bunext/react-ssr/hydrate.ts",
});

export async function doBuild() {
  const result = await builder.build();
  if (!result.success) {
    console.log(
      ...result.logs,
      "\nError while building the app...\n Look for a 'use client' missing probably where there is a hook in an exported function"
    );
  }
}

if (import.meta.main) {
  await doBuild();
}
