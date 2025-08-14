import { generateRandomString } from "features/utils";
import { RequestManager, router } from "internal/server/router";



export async function serveFromBuildDirectory(manager: RequestManager) {
    if (!manager.pathname.split("/").at(-1)?.includes(".")) return false;
    const staticResponse = await router.serveFromDir({
        directory: router.buildDir,
        path: manager.pathname,
    });
    if (!staticResponse) return false;

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

    manager.bunextReq.setResponse(staticResponse, {
        headers: {
            "Content-Type": staticResponse.type,
            ...(process.env.NODE_ENV == "production"
                ? ProductionHeader
                : DevHeader),
        }
    });

    return true;
}