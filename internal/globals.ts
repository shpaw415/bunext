import type { _Head } from "../features/head";

declare global {
  var head: { [key: string]: _Head };
  var MakeServerActionRequest: (
    props: Array<any>,
    serverActionID: string
  ) => Promise<any>;
}

export const paths = {
  bunextDirName: ".bunext",
  bunextModulePath: "node_modules/@bunpmjs/bunext",
  basePagePath: "src/pages",
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
          "only one prop is permited with a FormData in a ServerAction"
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
  return await ParseServerActionResponse(res);
}

type ServerActionDataTypeHeader = "json" | "file" | "blob";

async function ParseServerActionResponse(response: Response) {
  if (!response.ok)
    throw new Error(
      "error when Calling server action <!ModulePath!>:<!FuncName!>"
    );
  globalThis.__PUBLIC_SESSION_DATA__ = JSON.parse(
    response.headers.get("session") || ""
  );

  switch (response.headers.get("dataType") as ServerActionDataTypeHeader) {
    case "json":
      return ((await response.json()) as { props: any }).props;
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

globalThis.MakeServerActionRequest ??= MakeServerActionRequest;
