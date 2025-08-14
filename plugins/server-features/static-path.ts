import { type RequestManager } from "internal/server/router";


export async function serveStaticAssets(manager: RequestManager) {
    const staticAssets = await manager.router.serveFromDir({
        directory: manager.router.staticDir,
        path: manager.pathname,
    });
    if (staticAssets == null && manager.pathname == "/favicon.ico") {
        manager.bunextReq.__BYPASS_RESPONSE__ = new Response(null, {
            status: 404,
        });
    } else if (staticAssets !== null) {
        manager.bunextReq.setResponse(
            staticAssets, {
            headers: {
                "Content-Type": staticAssets.type,
            },
        });
    }
}