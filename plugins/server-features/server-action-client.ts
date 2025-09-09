"use client";

import { navigate } from "internal/router/client";

declare global {
    var ServerActionCallbacks: {
        callback: (response: Response) => void;
        id: string;
    }[];
}

globalThis.ServerActionCallbacks ??= [];

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
    let _props: Array<unknown> = props.map((prop) => {
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
    formData.append("__BUNEXT_PROPS__", encodeURI(JSON.stringify(_props)));
    return formData;
}


globalThis.MakeServerActionRequest ??= MakeServerActionRequest;