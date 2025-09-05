import { type RequestManager } from "internal/server/router";
import type { BunextPlugin } from "plugins/types";


async function serveStaticAssets(manager: RequestManager) {
    const staticAssets = await manager.router.serveFromDir({
        directory: manager.router.staticDir,
        path: manager.pathname,
        suffixes: [""]
    });
    if (staticAssets === null) return;
    manager.bunextReq.isStaticAsset = true;
    manager.bunextReq.setResponse(
        staticAssets, {
        headers: {
            "Content-Type": staticAssets.type,
        },
    }).sendNow();
}


export default {
    name: "static-assets-plugin",
    priority: 0,
    router: {
        request(manager) {
            if (manager.bunextReq.isResponseSetted() || manager.bunextReq.isClientNavigating) return;
            return serveStaticAssets(manager);
        }
    }
} as BunextPlugin;