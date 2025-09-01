import type { RequestManager } from "internal/server/router";
import { BunextError } from "internal/server/server_global";
import type { BunextPlugin } from "plugins/types";
import { BunextRequest } from "public/request";

class APIEndpointError extends BunextError { }

type APIModuleFunction = (req: BunextRequest) => Promise<Response> | Response;

type APIModule = {
    GET?: APIModuleFunction;
    HEAD?: APIModuleFunction;
    OPTIONS?: APIModuleFunction;
    TRACE?: APIModuleFunction;
    PUT?: APIModuleFunction;
    DELETE?: APIModuleFunction;
    POST?: APIModuleFunction;
    PATCH?: APIModuleFunction;
    CONNECT?: APIModuleFunction;
};

const API_METHODS = [
    "GET",
    "HEAD",
    "OPTIONS",
    "TRACE",
    "PUT",
    "DELETE",
    "POST",
    "PATCH",
    "CONNECT"
] as const;

async function serveAPIEndpoint(manager: RequestManager): Promise<boolean> {
    if (manager.clientSide || !manager.serverSide) {
        return false;
    }

    try {
        const ApiModule = await import(manager.serverSide.filePath) as APIModule;
        const method = manager.bunextReq.request.method.toUpperCase() as keyof APIModule;

        if (typeof ApiModule[method] === "undefined" || !API_METHODS.includes(method)) {
            return false;
        }

        await manager.bunextReq.session.initData();

        const res = await ApiModule[method](manager.bunextReq);

        if (res instanceof Response) {
            manager.bunextReq.__BYPASS_RESPONSE__ = res;
        } else {
            throw new APIEndpointError(
                `API Endpoint ${manager.serverSide.filePath} did not return a Response object`
            );
        }

        return true;
    } catch (error) {
        throw error;
    }
}

export default {
    name: "api-route-plugin",
    priority: 1,
    router: {
        request(manager) {
            if (manager.bunextReq.isResponseSetted()) return;
            serveAPIEndpoint(manager);
        }
    }
} as BunextPlugin;