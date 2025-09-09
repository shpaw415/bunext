"server only";

import type { MatchedRoute } from "bun";
import { CacheManager } from "internal/caching";
import { RouteNotFoundError, type RequestManager } from "internal/server/router";
import { BunextError } from "internal/server/server_global";
import type { getServerSidePropsFunction, ServerSideProps } from "internal/types";
import type { SessionPluginContext } from "plugins/session";
import type { BunextPlugin } from "plugins/types";

class ServerSidePropsError extends BunextError { }

type ServerSidePropsTyped = ServerSideProps<{}> | null | undefined;


declare global {
    var __SERVERSIDE_PROPS__: ServerSidePropsTyped;
}


export type ServerSidePropsContext = {
    __SERVERSIDE_PROPS__?: ServerSidePropsTyped;
};

type RequestManagerContexted = RequestManager<ServerSidePropsContext>;


class ServerSidePropsManager {
    public cache!: CacheManager<Record<string, unknown>>;

    static async create() {
        const instance = new ServerSidePropsManager();
        instance.cache = await CacheManager.create("__SERVER_SIDE_PROPS__");
        return instance;
    }

    clear() {
        return this.cache.clear();
    }

    getFromCache(manager: RequestManagerContexted): Promise<ServerSidePropsTyped> | null {
        if (!manager.bunextReq.match) return null;
        return this.cache.get(manager.bunextReq.match?.pathname);
    }
    getFromCacheByPath(pathname: string) {
        return this.cache.get(pathname) as ServerSidePropsTyped | null;
    }

    addToCache(manager: RequestManagerContexted, props: ServerSidePropsTyped) {
        if (!manager.bunextReq.match || props == undefined) return;
        this.cache.set(manager.bunextReq.match.pathname, props);
    }
    addToCacheByPathname(pathname: string, props: ServerSidePropsTyped) {
        if (!props) return;
        this.cache.set(pathname, props);
    }

    removeFromCache(manager: RequestManagerContexted) {
        if (!manager.bunextReq.match) return;
        this.cache.delete(manager.bunextReq.match.pathname);
    }
    removeFromCacheByPathname(pathname: string) {
        this.cache.delete(pathname);
    }
    /**
     * Make serverSideProps for the current request pathname
     */
    async make(manager: RequestManagerContexted) {
        // Return cached props if available
        if (manager.bunextReq.context?.__SERVERSIDE_PROPS__) {
            return manager.bunextReq.context.__SERVERSIDE_PROPS__;
        }

        if (!manager.bunextReq.match) throw new ServerSidePropsError("No matching route found");

        try {
            const result = await this.makeForPath(manager.bunextReq.match.filePaths.src, manager);
            (manager.bunextReq.setContext({
                __SERVERSIDE_PROPS__: result
            }));
            return result;

        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new ServerSidePropsError(
                `Failed to load server-side props for ${manager.pathname}: ${message}`
            );
        }
    }
    /**
     * Make serverSideProps for a specified filePath
     */
    async makeForPath(filePath: string, manager: RequestManagerContexted) {
        const module = (await import(filePath)) as {
            getServerSideProps?: getServerSidePropsFunction;
        };

        // Return empty props if no getServerSideProps function
        if (!module?.getServerSideProps) {
            return null;
        }

        // Initialize session
        await manager.bunextReq.getContext<SessionPluginContext>().__INIT_SESSION__();

        // Call the getServerSideProps function
        const result = await module.getServerSideProps(
            {
                request: manager.request,
                params: manager.bunextReq.match?.params,
            },
            manager.bunextReq
        );

        return result;
    }
}

export const serverSidePropsManager = await ServerSidePropsManager.create();


function serveServerSideProps(manager: RequestManagerContexted, props: ServerSidePropsTyped): void {
    try {
        manager.bunextReq.preventGlobalValuesInjection();
        manager.bunextReq.preventRewrite();
        manager.bunextReq.setResponse(props !== null ? JSON.stringify(props) : props, {
            headers: {
                "Content-Type": "application/vnd.server-side-props",
                "Cache-Control": "no-store",
            },
        });
    } catch (error) {
        console.error('Error serving server-side props:', error);
        const message = error instanceof Error ? error.message : String(error);
        throw new ServerSidePropsError(`Failed to serve server-side props: ${message}`);
    }
}

/**
 * Sets the redirect path for the response to the BunextRequest.
 * @param manager The request manager.
 * @param to The path to redirect to.
 */
function setRedirectToPath(to: string) {
    return [null,
        {
            headers: { Location: to },
            status: 302
        }] as const
}


export function isRequestGetServerSideProps(manager: RequestManager): boolean {
    return (manager.request.headers.get("Accept")?.includes("application/vnd.server-side-props") && (typeof manager.serverSide !== "undefined")) as boolean;
}

export default {
    name: "bunext-server-side-props",
    priority: 1,
    router: {
        async request(manager) {
            if (manager.request.headers.get("accept") == "application/vnd.server-side-props" && manager.serverSide?.filePath) {
                let props = await serverSidePropsManager.getFromCache(manager);
                if (!props) props = await serverSidePropsManager.makeForPath(manager.serverSide.filePath, manager);
                return serveServerSideProps(manager, props);
            } else if (manager.bunextReq.isAskingHTML && manager.bunextReq.match) {
                let props = await serverSidePropsManager.getFromCache(manager);
                if (!props) props = await serverSidePropsManager.make(manager);
                if (props?.redirect) {
                    return manager.bunextReq.setResponse(...setRedirectToPath(props.redirect)).sendNow();
                }
                manager.bunextReq.InjectGlobalValues<ServerSidePropsContext>({
                    __SERVERSIDE_PROPS__: props
                });
                manager.bunextReq.setContext<ServerSidePropsContext>({
                    __SERVERSIDE_PROPS__: props
                });
            } else if (manager.bunextReq.isClientNavigating) {
                let props = await serverSidePropsManager.getFromCache(manager);
                if (!props) props = await serverSidePropsManager.make(manager);
                manager.bunextReq.setContext<ServerSidePropsContext>({
                    __SERVERSIDE_PROPS__: props
                });
            }
        }
    }
} as BunextPlugin;