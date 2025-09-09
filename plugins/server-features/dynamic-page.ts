import { RenderingError, type RequestManager } from "internal/server/router";
import { serverSidePropsManager } from "./serverSideProps";
import type { JSX } from "react";
import { fallBackComponents } from "internal/server/fallbacks";
import type { SessionPluginContext } from "plugins/session";

export async function serveDynamicPage(manager: RequestManager): Promise<boolean> {

    if (!manager.bunextReq.isAskingHTML || manager.bunextReq.isResponseSetted()) {
        return false;
    }

    try {
        const serverSideProps = (await serverSidePropsManager.make(manager));
        manager.bunextReq.getContext<SessionPluginContext>().session.prevent_session_init();

        let pageJSX: JSX.Element | null = null;
        try {
            pageJSX = await manager.makeDynamicJSXPage({ serverSideProps });
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