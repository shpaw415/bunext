import { RenderingError, type RequestManager } from "internal/server/router";
import { type ServerSidePropsContext } from "./serverSideProps";
import type { JSX } from "react";
import { fallBackComponents } from "internal/server/fallbacks";
import type { SessionPluginContext } from "plugins/session";
import { renderToString } from "react-dom/server";

export async function serveDynamicPage(manager: RequestManager): Promise<boolean> {

    if (!manager.bunextReq.isAskingHTML || manager.bunextReq.isResponseSetted()) {
        return false;
    }

    try {
        manager.bunextReq.setResponse(
            renderToString(await (await createDynamicPage(manager)).wrap()),
            {
                headers: {
                    "Content-Type": "text/html",
                },
            }
        );
        return true;
    } catch (error) {
        console.error('Error serving page:', error);
        const message = error instanceof Error ? error.message : String(error);
        throw new RenderingError(`Failed to serve page: ${message}`);
    }
}

type DynamicPageCreate = {
    /**
 * The raw JSX element of the page.
 */
    page: JSX.Element;
    /**
 * Wraps the page JSX element with the necessary shell.
 * @returns Wrapped JSX element.
 */
    wrap: () => Promise<JSX.Element>;
};


export async function createDynamicPage(
    manager: RequestManager,
    options: Partial<{
        init_session: boolean,
        init_serverSideProps: boolean
    }> = {
            init_session: true,
            init_serverSideProps: true
        }
): Promise<DynamicPageCreate> {

    const context = manager.bunextReq.getContext<SessionPluginContext & ServerSidePropsContext>();
    if (options?.init_session) {
        await context.__INIT_SESSION__();
    }
    const serverSideProps = await context.__SERVERSIDE_PROPS__?.value();

    let pageJSX: JSX.Element | null = null;

    try {
        pageJSX = await manager.makeDynamicJSXPage({
            modulePath: manager.bunextReq.match?.filePaths.src as string,
            serverSideProps: serverSideProps as Record<string, unknown> || {},
            params: manager.bunextReq.match?.params,
            routeName: manager.bunextReq.match?.route as string
        });
    } catch (error) {
        console.error('Error creating dynamic JSX element:', error);
        pageJSX = await fallBackComponents.getErrorFallbackComponent(manager, error as Error);
    }

    if (!pageJSX) throw new RenderingError('No JSX element returned from dynamic page module.');

    return {
        page: pageJSX,
        wrap: () => manager.WrapPageWithShell(pageJSX, manager.bunextReq)
    };
}