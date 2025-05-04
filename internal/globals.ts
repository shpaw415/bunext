import type { _Head } from "../features/head";
import { jsxDEV, Fragment, type JSXSource } from "react/jsx-dev-runtime";
import { jsxs, jsx } from "react/jsx-runtime";
import React from "react";
import { navigate } from "./router/index";

declare global {
  var head: { [key: string]: _Head };
  var MakeServerActionRequest: (
    props: Array<any>,
    serverActionID: string
  ) => Promise<any>;

  var jsx_w77yafs4: (
    type: React.ElementType,
    props: unknown,
    key?: React.Key
  ) => React.ReactElement;
  var jsx: (
    type: React.ElementType,
    props: unknown,
    key?: React.Key
  ) => React.ReactElement;
  var jsxDEV_7x81h0kn: (
    type: React.ElementType,
    props: unknown,
    key: React.Key | undefined,
    isStatic: boolean,
    source?: JSXSource,
    self?: unknown
  ) => React.ReactElement;
  var jsxDEV: (
    type: React.ElementType,
    props: unknown,
    key: React.Key | undefined,
    isStatic: boolean,
    source?: JSXSource,
    self?: unknown
  ) => React.ReactElement;
  var jsxs_eh6c78nj: (
    type: React.ElementType,
    props: unknown,
    key?: React.Key
  ) => React.ReactElement;
  var jsxs: (
    type: React.ElementType,
    props: unknown,
    key?: React.Key
  ) => React.ReactElement;
  var Fragment_8vg9x3sq: React.ExoticComponent<{
    children?: React.ReactNode | undefined;
  }>;
  var Fragment: React.ExoticComponent<{
    children?: React.ReactNode | undefined;
  }>;
  var ServerActionCallbacks: {
    callback: (response: Response) => void;
    id: string;
  }[];
}

globalThis.React = React;
globalThis.jsx_w77yafs4 = jsx;
globalThis.jsx = jsx;
globalThis.jsxDEV_7x81h0kn = jsxDEV;
globalThis.jsxDEV = jsxDEV;
globalThis.jsxs_eh6c78nj = jsxs;
globalThis.jsxs = jsxs;
globalThis.Fragment_8vg9x3sq = Fragment;
globalThis.Fragment = Fragment;
globalThis.ServerActionCallbacks ??= [];

export const paths = {
  bunextDirName: ".bunext",
  bunextModulePath: "node_modules/bunext-js",
  basePagePath: "src/pages",
  basePath: "src",
  staticPath: "static",
} as const;

export const names = {
  bunextModuleName: "bunext",
  loadScriptPath: "/bunext-scripts",
} as const;

export const exitCodes = {
  build: 102,
  runtime: 101,
} as const;

export function AddServerActionCallback(
  callback: (response: Response) => void,
  id: string
) {
  if (globalThis.ServerActionCallbacks.find((e) => e.id == id)) {
    globalThis.ServerActionCallbacks.splice(
      globalThis.ServerActionCallbacks.findIndex((e) => e.id == id),
      1
    );
  }
  ServerActionCallbacks.push({ callback, id });
}

function InitServerActionData(...props: Array<any>) {
  let currentPropsIndex = 0;
  const formatToFile = () => {
    currentPropsIndex++;
    return `BUNEXT_FILE_${currentPropsIndex}`;
  };
  const formatToBatchedFile = () => {
    return `BUNEXT_BATCH_FILES_${currentPropsIndex}`;
  };

  let formData = new FormData();

  let _props: Array<any> = props.map((prop) => {
    if (prop instanceof File) {
      const id = formatToFile();
      formData.append(id, prop);
      return id;
    } else if (Array.isArray(prop) && prop.length > 0) {
      currentPropsIndex++;
      const id = formatToBatchedFile();
      return prop.map((p) => {
        if (p instanceof File) {
          formData.append(id, p);
          return id;
        } else return p;
      });
    } else if (prop instanceof FormData) {
      if (props.length > 1)
        throw new Error(
          "only one prop is permitted with a FormData in a ServerAction"
        );
      formData = prop;
      return "BUNEXT_FORMDATA";
    } else return prop;
  });
  formData.append("props", encodeURI(JSON.stringify(_props)));
  return formData;
}

export async function MakeServerActionRequest(
  props: Array<any>,
  serverActionID: string
) {
  const res = await fetch("/ServerActionGetter", {
    headers: {
      serverActionID: serverActionID,
    },
    method: "POST",
    body: InitServerActionData(...props),
  });
  for (const el of globalThis.ServerActionCallbacks) el.callback(res.clone());
  return await ParseServerActionResponse(res);
}

type ServerActionDataTypeHeader = "json" | "file" | "blob";

async function ParseServerActionResponse(response: Response) {
  if (!response.ok)
    throw new Error(
      "error when Calling server action <!ModulePath!>:<!FuncName!>"
    );

  switch (response.headers.get("dataType") as ServerActionDataTypeHeader) {
    case "json":
      const props = ((await response.json()) as { props: any }).props;
      if (props?.redirect) navigate(props.redirect);
      return props;
    case "blob":
      return await response.blob();
    case "file":
      const blob = await response.blob();
      const { name, lastModified } = JSON.parse(
        response.headers.get("fileData") || ""
      ) as { name: string; lastModified: number };
      return new File([blob], name, {
        type: blob.type,
        lastModified: lastModified,
      });
  }
}

export function GetSessionFromResponse(response: Response) {
  return JSON.parse(decodeURI(response.headers.get("session") || "")) as Record<
    string,
    any
  >;
}

globalThis.MakeServerActionRequest ??= MakeServerActionRequest;
