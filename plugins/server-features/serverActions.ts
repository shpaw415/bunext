import CacheManager from "internal/caching";
import { RequestManager, router } from "internal/server/router";
import type { ServerAction, ServerActionDataType, ServerActionDataTypeHeader } from "internal/types";
import { normalize, parse } from "path";


let serverActions: Array<ServerAction> = [];

function extractServerActionHeader(header: Record<string, string>) {
    if (!header.serveractionid) return null;
    const serverActionData = header.serveractionid.split(":");

    if (!serverActionData) return null;
    return {
        path: serverActionData[0],
        call: serverActionData[1],
    };
}

function extractPostData(data: FormData) {
    let raw = data.get("__BUNEXT_PROPS__");
    if (typeof raw != "string") return [];
    try {
        raw = decodeURI(raw);
    } catch {
        throw new Error("Cannot decode server action payload");
    }

    return (JSON.parse(raw) as Array<unknown>).map((prop) => {
        if (typeof prop == "string" && prop.startsWith("BUNEXT_FILE_")) {
            return data.get(prop) as File;
        } else if (
            Array.isArray(prop) &&
            prop.length > 0 &&
            typeof prop[0] == "string" &&
            prop[0].startsWith("BUNEXT_BATCH_FILES_")
        ) {
            return data.getAll(prop[0]);
        } else if (typeof prop == "string" && prop == "BUNEXT_FORMDATA") {
            data.delete("__BUNEXT_PROPS__");
            return data;
        } else return prop;
    });
}

export async function serverActionGetter(manager: RequestManager): Promise<[body: BodyInit | null, init?: ResponseInit]> {
    const reqData = extractServerActionHeader(manager.request_header);

    if (!reqData) {
        const availableHeaders = Object.keys(manager.request_header).join(', ');
        throw new Error(`No request data for ServerAction. Missing 'serveractionid' header. Available headers: [${availableHeaders}]`);
    }

    let props: unknown[];
    try {
        props = extractPostData(manager.data);
    } catch (error) {
        throw new Error(`Failed to extract POST data for ServerAction ${reqData.path}:${reqData.call}. Error: ${error}`);
    }

    const module = serverActions.find(
        (s) => s.path === reqData.path.slice(1)
    );
    if (!module) {
        const availableModules = serverActions.map(s => s.path).join(', ');
        throw new Error(`No module found for ServerAction path '${reqData.path}'. Available modules: [${availableModules}]. Total modules loaded: ${serverActions.length}`);
    }

    const call = module.actions.find((f) => f.name === reqData.call);
    if (!call) {
        const availableActions = module.actions.map(f => f.name).join(', ');
        throw new Error(`No function found for ServerAction '${reqData.call}' in module '${reqData.path}'. Available actions: [${availableActions}]. Total actions in module: ${module.actions.length}`);
    }
    const fillUndefinedParams = (
        Array.apply(null, Array(call.length)) as Array<null>
    ).map(() => undefined);

    try {
        let result = await call(
            ...[...props, ...fillUndefinedParams, manager.bunextReq]
        );
        let dataType: ServerActionDataTypeHeader = "json";
        let fileDataHeader: Record<string, unknown> = {};
        if (result instanceof Blob || result instanceof File) {
            dataType = "file";
            fileDataHeader = {
                fileData: JSON.stringify({
                    name: parse((result as File)?.name || "")?.base || "",
                    lastModified: (result as File).lastModified || 0,
                }),
                "Content-Type": "application/octet-stream"
            };
        } else {
            result = JSON.stringify({ props: result });
            fileDataHeader = {
                "Content-Type": "application/json"
            };
        }

        return [result as Exclude<ServerActionDataType, object>, {
            headers: {
                dataType,
                ...fileDataHeader,
            },
        }];
    } catch (error) {
        throw error;
    }
}

/**
 * Initializes server actions from page files
 */
export async function InitServerActions() {
    try {
        const files = router.getFilesFromPageDir().filter((file) => !file.endsWith("d.ts"));
        clearServerActions();

        for (const file of files) {
            try {
                const filePath = normalize(`${router.pageDir}/${file}`);
                const moduleImport = normalize(`${process.cwd()}/${filePath}`);
                const moduleExports = await import(process.env.NODE_ENV == "development" ? `${moduleImport}?${Bun.randomUUIDv7()}` : moduleImport);

                const serverActionNames = Object.keys(moduleExports).filter((name) =>
                    name.startsWith("Server")
                );

                if (serverActionNames.length > 0) {
                    serverActions.push({
                        path: file,
                        actions: serverActionNames.map((name) => moduleExports[name]),
                    });
                }
            } catch (error) {
                if ((error as Error)?.message == "Requested module is not instantiated yet.") continue;
                console.warn(`Failed to process server actions for ${file}:`, error);
            }
        }

    } catch (error) {
        console.error("Failed to initialize server actions:", error);
        throw error;
    }
}

export function clearServerActions() {
    serverActions = [];
}

export function getServerActions() {
    return serverActions;
}

export async function onRequestServerAction(manager: RequestManager): Promise<boolean> {
    if (manager.bunextReq.URL.pathname == "/ServerActionGetter") {
        await manager.bunextReq.session.initData();
        manager.bunextReq.preventRewrite();
        manager.bunextReq.preventGlobalValuesInjection();
        manager.bunextReq.setResponse(...(await serverActionGetter(manager)));

        return true;
    }
    return false;
}

/**
 * used for transform serverAction to tag for Transpiler
 */
export async function ServerActionToTag(moduleContent: Record<string, unknown>) {
    return Object.fromEntries(
        Object.keys(moduleContent)
            .filter((ex) => ex.startsWith("Server"))
            .map((ex) => [ex, `<!BUNEXT_ServerAction_${ex}!>`])
    );
}

export async function ServerComponentsToTag(
    modulePath: string,
    _module: Record<string, unknown>
) {
    // ServerComponent
    const ssrModule = CacheManager.getSSR(modulePath);
    const defaultName = (_module?.default as Function)?.name;
    let replaceServerElement: {
        [key: string]: {
            tag: string;
            reactElement: string;
        };
    } = {};
    for await (const exported of Object.keys(_module)) {
        const Func = _module[exported] as Function;

        if (
            !isFunction(Func) ||
            Func.name.startsWith("Server") ||
            Func.name == "getServerSideProps" ||
            Func.length > 0
        ) {
            continue;
        }

        const ssrElement = ssrModule?.elements.find(
            (e) => e.tag == `<!Bunext_Element_${Func.name}!>`
        );

        if (!ssrElement) continue;
        if (defaultName == Func.name) replaceServerElement.default = ssrElement;
        else replaceServerElement[Func.name] = ssrElement;
    }
    return replaceServerElement;
}

export function ServerActionCompiler(
    _module: Record<string, unknown>,
    fileContent: string,
    modulePath: string
) {
    const ServerActionsExports = Object.keys(_module).filter(
        (k) =>
            k.startsWith("Server") ||
            (k == "default" &&
                typeof _module[k] == "function" &&
                _module[k].name.startsWith("Server"))
    );
    // ServerAction
    for (const serverAction of ServerActionsExports) {
        const SAFunc = _module[serverAction] as AnyFn;
        const SAString = SAFunc.toString();
        if (!SAString.startsWith("async")) continue;
        fileContent = fileContent.replace(
            `"<!BUNEXT_ServerAction_${serverAction}!>"`,
            ServerActionToClient(SAFunc, modulePath)
        );
    }

    return fileContent;
}

type AnyFn = (...args: unknown[]) => unknown;
/**
 * this will set this.ssrElements & this.revalidates and make the build out from
 * a child process to avoid some error while building multiple time from the main process.
 */
function ServerActionToClient(func: AnyFn, ModulePath: string): string {
    const path = ModulePath.split(router.pageDir as string).at(
        1
    ) as string;

    const ServerActionClient = (ModulePath: string, funcName: string) => {
        return async function (...props: Array<any>) {
            return await globalThis.MakeServerActionRequest(props, "TARGET");
        }
            .toString()
            .replace("async function", "")
            .replace("TARGET", ModulePath + ":" + funcName);
    };

    return `async function ${func.name}${ServerActionClient(
        normalize(path),
        func.name
    )}`;
}

function isFunction(functionToCheck: any) {
    return typeof functionToCheck == "function";
}