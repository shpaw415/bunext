import { Builder } from "../bun-react-ssr/build";

declare global {
  var pages: {
    page: Blob;
    path: string;
  }[];
}

globalThis.pages ??= JSON.parse(process.env.__PAGE__ ?? "[]");

export const builder = new Builder({
  main: {
    baseDir: process.cwd(),
    buildDir: ".bunext/build",
    pageDir: "src/pages",
    hydrate: ".bunext/react-ssr/hydrate.ts",
  },
  display: {
    nextjs: {
      layout: "layout.tsx",
    },
  },
});

export async function doBuild() {
  const result = await builder.build();
  if (!result.success) {
    console.log(
      ...result.logs
      //"\n\nError while building the app...\n Look for a 'use client' missing probably where there is a hook in an exported function"
    );
    process.exit(101);
  }
}

if (import.meta.main) {
  await doBuild();
}
