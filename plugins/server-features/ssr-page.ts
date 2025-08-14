import type { FileSystemRouter } from "bun";
import CacheManager from "internal/caching";
import { router, type RequestManager } from "internal/server/router";
import type { PageModule } from "internal/types";
import type { BunextRequest } from "public/request";
import { createElement } from "react";


export let ssrAsDefaultRoutes: Array<keyof FileSystemRouter["routes"]> = [];

export function isAskingHTML(req: BunextRequest): boolean {
    if (
        req.request.headers.get("Accept")?.includes("text/html") &&
        req.request.method.toUpperCase() == "GET") return true;
    return false;
}

export function clearSSRPage() {
    CacheManager.clearSSR();
    CacheManager.clearSSRDefaultPage();
}

export async function onRequestSSRPage(manager: RequestManager): Promise<boolean> {
    // Handle SSR page requests
    if (isSSRDefaultExportPath(manager, true)) {
        if (!isAskingHTML(manager.bunextReq)) return false;
        manager.bunextReq.session.prevent_session_init();
        const stringPage = await getSSRDefaultPage(manager);
        if (stringPage) {
            manager.bunextReq.setResponse(stringPage, {
                headers: {
                    "content-type": "text/html; charset=utf-8",
                }
            });
            return true;
        }
    }
    return false;
}





async function getSSRDefaultPage(manager: RequestManager): Promise<string | null> {
    if (!isSSRDefaultExportPath(manager, true) || !manager.serverSide)
        return null;
    const cache = CacheManager.getSSRDefaultPage(manager.serverSide.pathname);
    if (cache) return cache;

    const preRenderedPage = await getPreRenderedPage(manager);
    if (!preRenderedPage) return null;

    const PageWithLayouts = await manager.router.stackLayouts(
        manager.serverSide,
        preRenderedPage
    );

    const shelledPage = await manager.WrapPageWithShell(PageWithLayouts);
    if (!shelledPage) return null;
    const stringifiedShelledPage = manager.JSXToString(shelledPage);

    CacheManager.addSSRDefaultPage(
        manager.serverSide.pathname,
        stringifiedShelledPage
    );

    return stringifiedShelledPage;
}

function isSSRDefaultExportPath(
    manager: RequestManager,
    andProduction?: boolean
) {
    if (andProduction && process.env.NODE_ENV != "production") return false;
    return Boolean(
        manager.serverSide &&
        ssrAsDefaultRoutes.includes(manager.serverSide?.name)
    );
}

async function getPreRenderedPage(manager: RequestManager) {
    if (!manager.serverSide) throw ErrorOnNoServerSideMatch(manager);
    const module = await import(manager.serverSide.filePath);
    const preBuiledPage = CacheManager.getSSR(
        manager.serverSide.filePath
    )?.elements.find((e) =>
        e.tag.endsWith(`${module.default.name}!>`)
    )?.htmlElement;

    if (!preBuiledPage) return null;

    return await manager.router.stackLayouts(
        manager.serverSide,
        HTMLJSXWrapper(preBuiledPage)
    );
}

function ErrorOnNoServerSideMatch(manager: RequestManager) {
    return new Error(`no serverSideScript found for ${manager.pathname}`);
}

function HTMLJSXWrapper(html: string) {
    return createElement("div", {
        id: "BUNEXT_INNER_PAGE_INSERTER",
        dangerouslySetInnerHTML: { __html: html },
    });
}


export function ServerComponentsCompiler(
    serverComponents: {
        [key: string]: {
            tag: string; // "<!Bunext_Element_FunctionName!>"
            reactElement: string;
        };
    },
    fileContent: string
) {
    for (const _component of Object.keys(serverComponents)) {
        const component = serverComponents[_component] as {
            tag: string;
            reactElement: string;
        };

        fileContent = fileContent.replace(
            `"${component.tag}"`,
            `() => (${component.reactElement});`
        );
    }

    return fileContent;
}

/**
 * Identifies routes that should use SSR as default (no props required)
 */
async function getSSRDefaultRoutes(): Promise<string[]> {
    try {
        const routes = router.getRoutesWithoutLayouts();

        const moduleChecks = await Promise.all(
            routes.map(async ([route, path]) => {
                try {
                    const module = (await import(path)) as PageModule;
                    return {
                        route,
                        hasNoProps: module.default?.length === 0,
                    };
                } catch (error) {
                    console.warn(`Failed to import module for route ${route}:`, error);
                    return { route, hasNoProps: false };
                }
            })
        );

        return moduleChecks
            .filter(({ hasNoProps }) => hasNoProps)
            .map(({ route }) => route);
    } catch (error) {
        console.warn("Failed to get SSR default routes:", error);
        return [];
    }
}

export async function initSSRPage() {
    try {
        ssrAsDefaultRoutes = await getSSRDefaultRoutes();
    } catch (error) {
        console.warn("Failed to initialize SSR Page:", error);
    }
}