import type { MatchedRoute } from "bun";
import { RouteNotFoundError, type RequestManager } from "internal/server/router";
import { BunextError } from "internal/server/server_global";
import type { getServerSidePropsFunction, ServerSideProps } from "internal/types";

class ServerSidePropsError extends BunextError { }
class RedirectError extends BunextError { }

type ServerSidePropsTyped = ServerSideProps<{}> | undefined;


declare global {
    var __SERVERSIDE_PROPS__: ServerSidePropsTyped;
}


export type ServerSidePropsContext = {
    __SERVERSIDE_PROPS__?: ServerSidePropsTyped;
};

type RequestManagerContexted = RequestManager<ServerSidePropsContext>;


export async function serveServerSideProps(manager: RequestManagerContexted): Promise<boolean> {
    if (manager.request.headers.get('accept') != "application/vnd.server-side-props") {
        return false;
    }

    try {
        const props = await makeServerSideProps(manager);
        manager.bunextReq.preventGlobalValuesInjection();
        manager.bunextReq.preventRewrite();
        manager.bunextReq.setResponse(JSON.stringify(props), {
            headers: {
                "Content-Type": "application/vnd.server-side-props",
                "Cache-Control": "no-store",
            },
        });
        return true;
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
function setRedirectToPath(to: string): Response {
    return new Response(null, {
        headers: { Location: to },
        status: 302
    });
}

export async function setGlobalServerSidePropsIfNeeded(manager: RequestManagerContexted): Promise<void> {
    const value = manager.bunextReq.getContext().__SERVERSIDE_PROPS__;
    if (!value) return;
    manager.bunextReq.InjectGlobalValues({
        __SERVERSIDE_PROPS__: value
    });
}

export async function makeServerSideProps(manager: RequestManager<ServerSidePropsContext>): Promise<ServerSidePropsTyped> {

    // Return cached props if available
    if (manager.bunextReq.context?.__SERVERSIDE_PROPS__) {
        return manager.bunextReq.context.__SERVERSIDE_PROPS__;
    }

    // Ensure we have a server-side route
    if (!manager.serverSide) {
        throw new RouteNotFoundError(`No server-side script found for ${manager.pathname}`);
    }

    try {
        const module = (await import(manager.serverSide.filePath)) as {
            getServerSideProps?: getServerSidePropsFunction;
        };

        // Return empty props if no getServerSideProps function
        if (!module?.getServerSideProps) {
            return undefined;
        }

        // Initialize session if needed
        await manager.bunextReq.session.initData();

        // Call the getServerSideProps function
        const result = await module.getServerSideProps(
            {
                request: manager.request,
                params: formatParams(manager.serverSide.params),
            },
            manager.bunextReq
        );

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

export function serverSidePropsAfterRequestHandler(manager: RequestManagerContexted): Response | void {
    const props = manager.bunextReq.getContext().__SERVERSIDE_PROPS__;
    if (props?.redirect && manager.request.headers.get("accept") == "application/vnd.server-side-props") {
        return setRedirectToPath(props.redirect);
    }

}

function formatParams(match: MatchedRoute["params"]): Record<string, unknown> {
    const params =
        Object.entries(match).map(([key, value]) => {
            const val = value.split("/");
            if (val.length > 1) {
                return [key, val];
            }
            return [key, val[0]];
        }) || [];

    return Object.fromEntries(params);
}
