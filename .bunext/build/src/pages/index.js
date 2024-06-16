import {
navigate
} from "./../../chunk-e9b87cc6d0d0a36c.js";
import {
__require,
__toESM,
require_jsx_dev_runtime
} from "./../../chunk-aa3fee3005799f72.js";
import {
Head
} from "./../../chunk-da0446598d6b3529.js";

// /var/bun_module/buNext/src/pages/index.tsx
var jsx_dev_runtime2 = __toESM(require_jsx_dev_runtime(), 1);
// /var/bun_module/buNext/node_modules/@bunpmjs/bunext/features/router.ts
var isServer = typeof window == "undefined";
var builderModule = isServer ? await import("../internal/build.ts") : undefined;

// /var/bun_module/buNext/src/pages/test.tsx
var jsx_dev_runtime = __toESM(require_jsx_dev_runtime(), 1);
var TestElement = () => jsx_dev_runtime.jsxDEV("div", {
  children: "Allo"
}, undefined, false, undefined, null);
// /var/bun_module/buNext/src/pages/index.tsx
var pages_default = () => jsx_dev_runtime2.jsxDEV("div", {
  children: [
    jsx_dev_runtime2.jsxDEV(TestElement, {}, undefined, false, undefined, null),
    jsx_dev_runtime2.jsxDEV("button", {
      onClick: () => navigate("/other"),
      children: "Other page"
    }, undefined, false, undefined, null)
  ]
}, undefined, true, undefined, null);
var ServerAction = async function ServerAction2(...props) {
  function generateRandomString(length) {
    let result = "";
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789", charactersLength = characters.length;
    for (let i = 0;i < length; i++)
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
    return result;
  }
  const formatToFile = () => `BUNEXT_FILE_${generateRandomString(10)}`, formData = new FormData;
  let _props = props.map((prop) => {
    if (prop instanceof File) {
      const id = formatToFile();
      formData.append(id, prop);
      return id;
    } else
      return prop;
  });
  formData.append("props", encodeURI(JSON.stringify(_props)));
  const response = await fetch("/ServerActionGetter", {
    headers: {
      serverActionID: "/index.tsx:ServerAction"
    },
    method: "POST",
    body: formData
  });
  if (!response.ok)
    throw new Error("error when Calling server action /index.tsx:ServerAction");
  const resObject = await response.json();
  __PUBLIC_SESSION_DATA__ = resObject.session;
  return resObject.props;
};
Head.setHead({
  data: {
    author: "John Doe",
    title: "my Hompage",
    publisher: "Bunext",
    meta: [
      {
        name: "foo",
        content: "bar"
      }
    ]
  }
});
export {
  pages_default as default,
  ServerAction
};
