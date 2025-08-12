import type { RequestManager } from "internal/server/router";
import { BunextError } from "internal/server/server_global";
import type { BunextPlugin } from "plugins/types";
import { BunextRequest } from "public/request";

class APIEndpointError extends BunextError { }

type APIModuleFunction = (req: BunextRequest) => Promise<Response> | Response;

type APIModule = {
    POST?: APIModuleFunction;
    GET?: APIModuleFunction;
    PUT?: APIModuleFunction;
    DELETE?: APIModuleFunction;
};

async function serveAPIEndpoint(manager: RequestManager): Promise<boolean> {
    if (manager.clientSide || !manager.serverSide) {
        return false;
    }

    try {
        const ApiModule = await import(manager.serverSide.filePath) as APIModule;
        const method = manager.bunextReq.request.method.toUpperCase() as keyof APIModule;

        if (typeof ApiModule[method] === "undefined") {
            return false;
        }

        await manager.bunextReq.session.initData();

        const res = await ApiModule[method](manager.bunextReq);

        if (res instanceof Response) {
            manager.bunextReq.setResponse(res);
        } else {
            throw new APIEndpointError(
                `API Endpoint ${manager.serverSide.filePath} did not return a Response object`
            );
        }

        return true;
    } catch (error) {
        if (error instanceof BunextError) {
            throw error;
        }
        console.error('Error serving API endpoint:', error);
        const message = error instanceof Error ? error.message : String(error);
        throw new APIEndpointError(`Failed to serve API endpoint: ${message}`);
    }
}

export default {
    router: {
        async request(request, manager) {
            if (await serveAPIEndpoint(manager)) return request;
        }
    }
} as BunextPlugin;