import { RenderingError, type RequestManager } from "internal/server/router";
import { type ServerSidePropsContext } from "./serverSideProps";
import type { JSX } from "react";
import { fallBackComponents } from "internal/server/fallbacks";
import type { SessionPluginContext } from "plugins/session";

export async function serveDynamicPage(manager: RequestManager): Promise<boolean> {

    if (!manager.bunextReq.isAskingHTML || manager.bunextReq.isResponseSetted()) {
        return false;
    }

    try {
        await manager.bunextReq.getContext<SessionPluginContext>().__INIT_SESSION__();
        const serverSideProps = manager.bunextReq.getContext<ServerSidePropsContext>().__SERVERSIDE_PROPS__?.value;

        let pageJSX: JSX.Element | null = null;
        try {
            pageJSX = await manager.makeDynamicJSXPage({
                modulePath: manager.bunextReq.match?.filePaths.src as string,
                serverSideProps
            });
        } catch (error) {
            console.error('Error creating dynamic JSX element:', error);
            pageJSX = await fallBackComponents.getErrorFallbackComponent(manager, error as Error);
        }

        if (!pageJSX) {
            return false;
        }

        manager.bunextReq.setResponse(
            manager.JSXToString(
                await manager.WrapPageWithShell(pageJSX)
            ),
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