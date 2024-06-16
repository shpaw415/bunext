import {
ReloadContext,
RouterHost,
getRouteMatcher,
require_react_dom
} from "./../../chunk-e9b87cc6d0d0a36c.js";
import {
__commonJS,
__toESM,
require_jsx_dev_runtime,
require_react
} from "./../../chunk-aa3fee3005799f72.js";
import {
HeadElement
} from "./../../chunk-da0446598d6b3529.js";

// node_modules/react-dom/client.js
var require_client = __commonJS((exports) => {
  var m = __toESM(require_react_dom(), 1);
  if (false) {
  } else {
    i = m.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
    exports.createRoot = function(c, o) {
      i.usingClientEntryPoint = true;
      try {
        return m.createRoot(c, o);
      } finally {
        i.usingClientEntryPoint = false;
      }
    };
    exports.hydrateRoot = function(c, h, o) {
      i.usingClientEntryPoint = true;
      try {
        return m.hydrateRoot(c, h, o);
      } finally {
        i.usingClientEntryPoint = false;
      }
    };
  }
  var i;
});

// /var/bun_module/buNext/node_modules/@bunpmjs/bunext/internal/hydrate.tsx
var client = __toESM(require_client(), 1);
var jsx_dev_runtime = __toESM(require_jsx_dev_runtime(), 1);
async function hydrate(Shell, {
  onRecoverableError = () => {
    return;
  },
  ...options
} = {}) {
  const matched = match(globalX.__INITIAL_ROUTE__.split("?")[0]);
  const Initial = await import(matched.value);
  let JsxToDisplay = jsx_dev_runtime.jsxDEV(Initial.default, {
    ...globalX.__SERVERSIDE_PROPS__?.props
  }, undefined, false, undefined, this);
  switch (globalX.__DISPLAY_MODE__) {
    case "nextjs":
      JsxToDisplay = await NextJsLayoutStacker({
        pageJsx: JsxToDisplay,
        global: globalX,
        matched
      });
      break;
  }
  return client.hydrateRoot(document, jsx_dev_runtime.jsxDEV(RouterHost, {
    Shell,
    ...options,
    children: jsx_dev_runtime.jsxDEV(Shell, {
      route: globalX.__INITIAL_ROUTE__,
      ...globalX.__SERVERSIDE_PROPS__,
      children: JsxToDisplay
    }, undefined, false, undefined, this)
  }, undefined, false, undefined, this), { onRecoverableError });
}
async function NextJsLayoutStacker({
  pageJsx,
  global,
  matched
}) {
  const layoutPath = global.__ROUTES__["/" + global.__LAYOUT_NAME__];
  if (matched.path === "/" && typeof layoutPath !== "undefined") {
    const Layout__ = await import(layoutPath);
    return await Layout__.default({ children: pageJsx });
  }
  const splitedRoute = matched.path.split("/");
  let index = 1;
  let defaultImports = [];
  const formatedRoutes = Object.keys(global.__ROUTES__).map((e) => `/${global.__PAGES_DIR__}${e}`).filter((e) => e.includes(global.__LAYOUT_NAME__));
  for await (const i of splitedRoute) {
    const request = `/${global.__PAGES_DIR__}${splitedRoute.slice(0, index).join("/")}/${global.__LAYOUT_NAME__}`;
    if (!formatedRoutes.includes(request))
      continue;
    defaultImports.push((await import(request + ".js")).default);
    index++;
  }
  let currentJsx = jsx_dev_runtime.jsxDEV(jsx_dev_runtime.Fragment, {}, undefined, false, undefined, this);
  defaultImports.push(() => pageJsx);
  defaultImports = defaultImports.reverse();
  for await (const Layout of defaultImports) {
    currentJsx = await Layout({ children: currentJsx });
  }
  return currentJsx;
}
"use client";
var globalX = globalThis;
var match = getRouteMatcher(globalX.__ROUTES__);

// /var/bun_module/buNext/node_modules/@bunpmjs/bunext/internal/globals.ts
globalThis.__NODE_ENV__ ??= "development";

// /var/bun_module/buNext/node_modules/@bunpmjs/bunext/dev/dev.tsx
var import_react = __toESM(require_react(), 1);
var jsx_dev_runtime2 = __toESM(require_jsx_dev_runtime(), 1);
function Dev() {
  if (typeof window === "undefined" || !globalThis.__BUNEXT_DEV_INIT)
    return jsx_dev_runtime2.jsxDEV(jsx_dev_runtime2.Fragment, {}, undefined, false, undefined, this);
  else
    globalThis.__BUNEXT_DEV_INIT = false;
  const reload = import_react.useContext(ReloadContext);
  const p = window.location;
  const ws = new WebSocket(`${p.protocol.includes("https") ? "wss" : "ws"}://${p.hostname}:3001`);
  ws.addEventListener("message", (ev) => {
    if (ev.data != "reload")
      return;
    try {
      reload();
    } catch {
      window.location.reload();
    }
  });
  ws.addEventListener("close", () => window.location.reload());
  globalThis.webSocket = ws;
  return jsx_dev_runtime2.jsxDEV(jsx_dev_runtime2.Fragment, {}, undefined, false, undefined, this);
}
globalThis.__BUNEXT_DEV_INIT ??= true;

// .bunext/react-ssr/shell.tsx
var jsx_dev_runtime3 = __toESM(require_jsx_dev_runtime(), 1);
var Shell = ({
  children,
  route
}) => {
  return jsx_dev_runtime3.jsxDEV("html", {
    children: [
      jsx_dev_runtime3.jsxDEV(HeadElement, {
        currentPath: route
      }, undefined, false, undefined, this),
      jsx_dev_runtime3.jsxDEV("body", {
        children
      }, undefined, false, undefined, this),
      jsx_dev_runtime3.jsxDEV(Dev, {}, undefined, false, undefined, this)
    ]
  }, undefined, true, undefined, this);
};

// .bunext/react-ssr/hydrate.ts
"use client";
await hydrate(Shell);
