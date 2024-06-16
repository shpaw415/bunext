import { revalidate } from "../features/router";
import { generateRandomString } from "../features/utils";
import { names, paths } from "./globals";

function setRevalidate(
  revalidates: {
    path: string;
    time: number;
  }[]
) {
  for (const reval of revalidates) {
    setInterval(async () => {
      await revalidate(reval.path);
    }, reval.time);
  }
}

async function serveStatic(request: Request) {
  const path = new URL(request.url).pathname;
  const file = Bun.file(paths.staticPath + path);
  if (!(await file.exists())) return null;
  return new Response(file);
}

function serveScript(request: Request) {
  globalThis.scriptsList ??= [];
  const path = new URL(request.url).pathname;
  if (names.loadScriptPath != path) return null;
  const _scriptsStr = globalThis.scriptsList.map((sc) => {
    const variable = `__${generateRandomString(5)}__`;
    return `const ${variable} = ${sc}; ${variable}();`;
  });
  return new Response(_scriptsStr.join("\n"), {
    headers: {
      "Content-Type": "text/javascript;charset=utf-8",
    },
  });
}

export { setRevalidate, serveScript, serveStatic };
