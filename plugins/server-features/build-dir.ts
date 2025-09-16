import { generateRandomString } from "features/utils";
import { RequestManager, router } from "internal/server/router";
import { extname, join } from "path";
import type { BunextPlugin } from "plugins/types";
import type { ClientIPCManager } from "plugins/utils";


let files: Array<Bun.BunFile> = [];
const cwd = process.cwd();

function getFileFromPathname(pathname: string): Bun.BunFile | undefined {
    const path = join(cwd, router.buildDir, pathname);
    const file = files.find(file => file.name === path);
    return file;
}

async function serveFromBuildDirectory(manager: RequestManager): Promise<void> {
    if (!manager.pathname.split("/").at(-1)?.includes(".")) return;

    const staticResponse = getFileFromPathname(manager.pathname);
    if (!staticResponse) return;
    manager.bunextReq.isStaticAsset = true;
    manager.bunextReq.preventRewrite().preventGlobalValuesInjection();
    const date = new Date();
    date.setTime(date.getTime() + 360000);
    const DevHeader = {
        "Cache-Control": "public, max-age=0, must-revalidate, no-store, no-cache",
        "Last-Modified": date.toUTCString(),
        Expires: new Date("2000/01/01").toUTCString(),
        Pragma: "no-cache",
        ETag: generateRandomString(5),
    };

    const ProductionHeader = {
        "Cache-Control": "public max-age=3600",
    };
    /*
        if (!manager.bunextReq.isClientNavigating) {
            manager.bunextReq.setResponse(staticResponse, {
                headers: {
                    "Content-Type": staticResponse.type,
                    ...(process.env.NODE_ENV == "production"
                        ? ProductionHeader
                        : DevHeader),
                }
            });
            return;
        }
    */
    if (staticResponse.name && extname(staticResponse.name) == ".js" && manager.bunextReq.URL.pathname.startsWith("/" + manager.router.pageDir)) {

        manager.bunextReq.setResponse([await staticResponse.text(), manager.bunextReq.globalDataToJSFormat()].join("\n"), {
            headers: {
                "Content-Type": "application/javascript",
                ...(process.env.NODE_ENV == "production"
                    ? ProductionHeader
                    : DevHeader),
            }
        });
        return;
    }


    manager.bunextReq.setResponse(staticResponse, {
        headers: {
            "Content-Type": staticResponse.type,
            ...(process.env.NODE_ENV == "production"
                ? ProductionHeader
                : DevHeader),
        }
    }).sendNow();
}


function setFiles(filesPaths: string[]) {
    files = [];
    files.push(...filesPaths.map(path => Bun.file(path)));
}

function setListeners(ipc: ClientIPCManager<"main" | "cluster">) {
    ipc.onMessage<string[]>("set-build-dir-files", setFiles);
}

export default {
    name: "bunext-build-dir-plugin",
    priority: 0,
    router: {
        request(manager) {
            if (manager.bunextReq.isResponseSetted()) return;
            return serveFromBuildDirectory(manager);
        }
    },
    serverStart: {
        main(ipc) {
            setListeners(ipc);
        },
        cluster(ipc) {
            setListeners(ipc);
        },
    },
    build: {
        after_build(artefact, ipc) {
            const paths = artefact.outputs.map(({ path }) => path);
            setFiles(paths);
            ipc.send<string[]>("cluster", "set-build-dir-files", paths);
        },
    }
} as BunextPlugin;