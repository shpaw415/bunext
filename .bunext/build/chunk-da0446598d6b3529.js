import {
__toESM,
require_jsx_dev_runtime
} from "./chunk-aa3fee3005799f72.js";

// /var/bun_module/buNext/node_modules/@bunpmjs/bunext/features/head.tsx
var jsx_dev_runtime = __toESM(require_jsx_dev_runtime(), 1);
var HeadElement = function({ currentPath }) {
  const globalX = globalThis;
  const data = typeof window != "undefined" ? globalX.__HEAD_DATA__[currentPath] : Head.head[currentPath];
  if (!data)
    return jsx_dev_runtime.jsxDEV("head", {}, undefined, false, undefined, this);
  const res = jsx_dev_runtime.jsxDEV("head", {
    children: [
      data?.meta?.map((e) => jsx_dev_runtime.jsxDEV("meta", {
        name: e.name,
        content: e.content
      }, e.name, false, undefined, this)) ?? undefined,
      Object.keys(data ?? {}).filter((n) => n != "meta").map((e) => {
        const val = data[e];
        if (e === "title")
          return jsx_dev_runtime.jsxDEV("title", {
            children: val
          }, e, false, undefined, this);
        return jsx_dev_runtime.jsxDEV("meta", {
          name: e,
          content: val
        }, e, false, undefined, this);
      })
    ]
  }, undefined, true, undefined, this);
  return res;
};

class HeadDataClass {
  head = {};
  currentPath;
  setHead({ data, path }) {
    if (path)
      this.head[path] = data;
    else if (this.currentPath)
      this.head[this.currentPath] = data;
  }
  _setCurrentPath(path) {
    this.currentPath = path.split("pages").slice(1).join("pages").replace("/index.tsx", "");
    if (this.currentPath.length == 0)
      this.currentPath = "/";
  }
}
var Head = new HeadDataClass;

export { Head, HeadElement };
