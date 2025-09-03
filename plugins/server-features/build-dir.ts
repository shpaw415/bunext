import { generateRandomString } from "features/utils";
import { RequestManager, router } from "internal/server/router";
import { extname, join } from "path";
import type { BunextPlugin } from "plugins/types";


let files: Array<Bun.BunFile> = [];
const cwd = process.cwd();

function getFileFromPathname(pathname: string): Bun.BunFile | undefined {
    const path = join(cwd, router.buildDir, pathname);
    return files.find(file => file.name === path);
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


export default {
    name: "bunext-build-dir-plugin",
    priority: 0,
    router: {
        request(manager) {
            if (manager.bunextReq.isResponseSetted()) return;
            return serveFromBuildDirectory(manager);
        }
    },
    build_main: {
        before_build() {
            files = [];
        },
        after_build(filesPaths) {
            files.push(...filesPaths.map(path => Bun.file(path)));
        }
    }
} as BunextPlugin;