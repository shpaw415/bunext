import type { RequestManager } from "internal/server/router";
import { BunextError } from "internal/server/server_global";
import type { SessionPluginContext } from "plugins/session";
import type { BunextPlugin } from "plugins/types";

class APIEndpointError extends BunextError { }

type APIModuleFunction = (req: RequestManager) => Promise<Response> | Response;

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

type APIModule = Record<typeof API_METHODS[number], APIModuleFunction | undefined>;



export default {
    name: "api-route-plugin",
    priority: 1,
    router: {
        async request(manager) {
            if (manager.bunextReq.isResponseSetted() || !manager.serverSide?.filePath) return;

            const ApiModule = await import(manager.serverSide.filePath) as APIModule;
            const method = manager.bunextReq.request.method.toUpperCase() as keyof APIModule;

            if (!API_METHODS.includes(method) || typeof ApiModule[method] === "undefined") return;

            await manager.bunextReq.getContext<SessionPluginContext>().__INIT_SESSION__()
            await ApiModule[method](manager);
        }
    }
} as BunextPlugin;