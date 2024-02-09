import type { MatchedRoute } from "bun";
import { _assetFileRouter, _fileRouter } from "./fileRouter";
import ReactDOMServer from "react-dom/server";
import {
  addJSXElementToResponse,
  compileGlobalResponse,
  createRootPage,
} from "./server-response";
import { retoreSpecialChar } from "./utils";
import { _setHeaderData } from "./header";

interface _fileRouterStruct {
  default?: (route: MatchedRoute) => JSX.Element | Promise<JSX.Element>;
}

function createServer() {
  return Bun.serve({
    async fetch(req) {
      const url = fileRouterParser(req.url);
      const route = _fileRouter.match(req);
      const asset = route ? null : await _assetFileRouter.match(url);

      if (route === null && asset === false) {
        return new Response("not found!");
      } else if (asset === true) {
        return new Response(Bun.file(_assetFileRouter.getPath()));
      } else if (route === null) throw new Error("no route");

      const page = (await import(`${route.filePath}`)) as _fileRouterStruct;
      if (!page.default)
        throw new Error(`${route.name} does not have a default function`);

      const pageJsx = await page.default(route);
      addJSXElementToResponse(pageJsx);
      const jsxWrapped = createRootPage(compileGlobalResponse());
      const pageData: string = ReactDOMServer.renderToStaticMarkup(jsxWrapped);
      return new Response(retoreSpecialChar(pageData), {
        headers: {
          "Content-Type": "text/html",
        },
      });
    },
  });
}

function fileRouterParser(route: string | null) {
  if (route == null) return "";
  const remove = ["http://", "https://"];
  let _route: string = `${route}`;
  for (const i of remove) {
    if (!route.startsWith(i)) continue;
    _route = route.replace(i, "");
  }
  return "/" + _route.split("/").slice(1).join("/");
}

export function startServer() {
  try {
    globalThis.server = createServer();
  } catch {}
}
