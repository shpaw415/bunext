import type { RequestManager } from "internal/server/router";
import { extname, normalize } from "path";
import type { BunextPlugin } from "plugins/types";

async function serveFromNodeModule(manager: RequestManager): Promise<void> {
    if (!manager.pathname.startsWith("/node_modules")) return;
    manager.bunextReq.preventGlobalValuesInjection().preventRewrite();
    const nodeModuleFile = await manager.router.serveFromDir({
        directory: "node_modules",
        path: normalize(manager.pathname.replace("node_modules", "")),
        suffixes: [
            "",
            ".js",
            ".jsx",
            ".ts",
            ".tsx",
            ".css",
            ".json",
            ".xml",
            ".csv",
            ".html",
        ],
    });
    if (!nodeModuleFile || !(await nodeModuleFile.exists())) return;
    const buildFile = (path: string) =>
        Bun.build({
            entrypoints: [path],
            outdir: manager.router.buildDir + "/node_modules",
            root: "node_modules",
            minify: process.env.NODE_ENV == "production",
        });
    const path = Bun.fileURLToPath(import.meta.resolve(manager.pathname));
    const ext = extname(path).replace(".", "");

    const getBuildedFile = (ext: "css" | "js") => {
        let formatedFileName = manager.pathname.split(".");
        formatedFileName.pop();
        formatedFileName.push(ext);
        return Bun.file(
            normalize(`${manager.router.buildDir}/${formatedFileName.join(".")}`)
        );
    };

    switch (ext) {
        case "csv":
        case "html":
        case "xml":
        case "json":
            return MakeTextRes(manager, nodeModuleFile);

        case "ts":
        case "tsx":
        case "jsx":
        case "js":
        case "css":
            const formatedExt = ext == "css" ? "css" : "js";
            const buildedFile = getBuildedFile(formatedExt);
            if (
                process.env.NODE_ENV == "production" &&
                (await buildedFile.exists())
            ) return MakeTextRes(manager, buildedFile);
            const res = await buildFile(`.${path}`);
            if (res.success) {
                return MakeTextRes(manager, getBuildedFile(formatedExt));
            }

            makeErrorResponse(manager, 500);
            break;
        default:
            makeErrorResponse(manager, 404);
            break;
    }
}

function makeErrorResponse(manager: RequestManager, status: number) {
    manager.bunextReq.setResponse(null, { status }).sendNow();
}

function MakeTextRes(manager: RequestManager, content: Bun.BunFile | string, mimeType?: string) {
    if (content instanceof Blob) {
        manager.bunextReq.setResponse(content).sendNow();
    } else {
        manager.bunextReq.setResponse(
            content, {
            headers: {
                "Content-Type": `text/${mimeType}`,
            },
        }).sendNow();
    }
}


export default {
    name: "bunext-node-modules",
    priority: 1,
    router: {
        request(manager) {
            if (manager.bunextReq.isResponseSetted()) return;
            return serveFromNodeModule(manager);
        }
    }
} as BunextPlugin;