import {
__toESM,
require_jsx_dev_runtime
} from "./../../chunk-673cab0a092e6c6d.js";

// /var/bun_module/buNext/src/pages/index.tsx
var jsx_dev_runtime = __toESM(require_jsx_dev_runtime(), 1);
var pages_default = () => jsx_dev_runtime.jsxDEV("div", {
  children: "Some Test"
}, undefined, false, undefined, null);
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
export {
  pages_default as default,
  ServerAction
};
