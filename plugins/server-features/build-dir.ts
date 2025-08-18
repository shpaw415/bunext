import { generateRandomString } from "features/utils";
import { RequestManager, router } from "internal/server/router";
import { extname } from "path";


export async function serveFromBuildDirectory(manager: RequestManager) {
    if (!manager.pathname.split("/").at(-1)?.includes(".")) return false;
    const staticResponse = await router.serveFromDir({
        directory: router.buildDir,
        path: manager.pathname,
    });
    if (!staticResponse) return false;
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
    if (staticResponse.name && extname(staticResponse.name) == ".js") {

        manager.bunextReq.setResponse([await staticResponse.text(), manager.bunextReq.globalDataToJSFormat()].join("\n"), {
            headers: {
                "Content-Type": "application/javascript",
                ...(process.env.NODE_ENV == "production"
                    ? ProductionHeader
                    : DevHeader),
            }
        });
        return true;
    }

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