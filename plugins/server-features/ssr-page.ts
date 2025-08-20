"server only";

import type { FileSystemRouter } from "bun";
import { CacheManagerPool } from "internal/caching";
import { router, type RequestManager } from "internal/server/router";
import type { ClusterMessageType, PageModule, ssrElement, SSRPage } from "internal/types";
import { createElement, type JSX } from "react";
import { join } from "path";
import type { Table } from "database/class";
import { builder } from "internal/server/build";

class SSRPageCache extends CacheManagerPool {

    constructor() {
        super({
            schema: [
                {
                    name: "ssr",
                    columns: [
                        {
                            name: "path",
                            type: "string",
                            primary: true,
                        },
                        {
                            name: "elements",
                            type: "json",
                            DataType: [
                                {
                                    tag: "string",
                                    reactElement: "string",
                                    htmlElement: "string",
                                },
                            ],
                        },

                    ],

                },
                {
                    name: "page",
                    columns: [
                        {
                            name: "route",
                            type: "string",
                            primary: true,
                            unique: true,
                        },
                        {
                            name: "content",
                            type: "string",
                        },
                    ],
                },
            ],
            dbPath: join(import.meta.dirname, "ssr_cache.sqlite"),
        })
    }
    private ssr<T>(callback: (table: Table<ssrElement, ssrElement>) => T | Promise<T>) {
        return this.getTable<ssrElement, ssrElement>("ssr", callback) as Promise<T>;
    }
    private page<T>(callback: (table: Table<SSRPage, SSRPage>) => T | Promise<T>) {
        return this.getTable<SSRPage, SSRPage>("page", callback) as Promise<T>;
    }

    //SSR Default Page

    addSSRDefaultPage(route: string, content: string) {
        return this.page(t => t.upsert([{ route, content }], ["route"]));
    }
    async getSSRDefaultPage(route: string) {
        return (await this.page(t => t
            .select({
                where: {
                    route,
                },
                select: {
                    content: true,
                },
                limit: 1
            }))).at(0)?.content;
    }
    removeSSRDefaultPage(...route: string[]) {
        this.page(t => t.delete({
            where: { OR: route.map(r => ({ route: r })) },
        }));
    }
    clearSSRDefaultPage() {
        return this.page(t => t.databaseInstance.run("DELETE FROM page"));
    }

    // SSR Element

    async addSSR(path: string, elements: ssrElement["elements"]) {
        await this.ssr(t => t.upsert([
            {
                path,
                elements,
            },
        ], ["path"]));

        return {
            path,
            elements,
        } as ssrElement;
    }
    async getSSR(path: string) {
        return (await this.ssr(t => t.select({ where: { path }, limit: 1 }))).at(0);
    }
    async getAllSSR() {
        return (await this.ssr(t => t.select()));
    }
    async deleteSSR(path: string) {
        return this.ssr(t => t.delete({ where: { path } }));
    }
    clearSSR() {
        return this.ssr(t => t.databaseInstance.run("DELETE FROM ssr"));
    }
}


export const SSRCache = new SSRPageCache();

export let ssrAsDefaultRoutes: Array<keyof FileSystemRouter["routes"]> = [];

export function clearSSRPage() {
    SSRCache.clearSSR();
    SSRCache.clearSSRDefaultPage();
}

export async function onRequestSSRPage(manager: RequestManager): Promise<boolean> {
    // Handle SSR page requests
    if (!isSSRDefaultExportPath(manager, true) || !manager.bunextReq.isAskingHTML) return false;
    manager.bunextReq.session.prevent_session_init();
    const stringPage = await getSSRDefaultPage(manager);
    if (stringPage) {
        manager.bunextReq.setResponse(stringPage, {
            headers: {
                "content-type": "text/html; charset=utf-8",
                "cache-control": "no-cache"
            }
        });
        return true;
    }
    return false;
}





async function getSSRDefaultPage(manager: RequestManager): Promise<string | null> {
    if (!isSSRDefaultExportPath(manager, true) || !manager.serverSide)
        return null;
    const cache = await SSRCache.getSSRDefaultPage(manager.serverSide.pathname);
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

    SSRCache.addSSRDefaultPage(
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
    const module = await import(manager.serverSide.filePath) as { default?: () => JSX.Element };
    const preBuiledPage = (await SSRCache.getSSR(
        manager.serverSide.filePath
    ))?.elements.find((e) =>
        e.tag.endsWith(`${module.default?.name}!>`)
    )?.htmlElement;

    if (!preBuiledPage) return null;

    return HTMLJSXWrapper(preBuiledPage);
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

const noRouteThrow = (route: string) =>
    new Error(`route ${route} does not exists`);

const findRouteOrThrow = (path: string) => {
    const matched = router.server.match(path);
    if (!matched) throw noRouteThrow(path);
    return matched;
};

export async function revalidate(...path: string[]) {
    const _paths = path.map((p) => findRouteOrThrow(p));

    const route = (await Promise.all(_paths
        .map(async (route) => {
            const res = await builder.findPathIndex(route.filePath);
            return res ? route : null;
        }))).filter(t => t !== null);

    if ((await import("node:cluster")).default.isWorker) {
        process.send?.({
            task: "revalidate",
            data: {
                path,
            },
        } as ClusterMessageType);
        return;
    }
    SSRCache.removeSSRDefaultPage(...route.map(({ pathname }) =>
        pathname
    ));
    await Promise.all(route.map(({ filePath }) => builder.resetPath(filePath)));
    await builder.makeBuild();
}
/**
 *
 * @param path relative path from src/pages Exemple: "/" or "/user"
 * @param seconde every x seconde to revalide
 */

export async function revalidateEvery(path: string | string[], seconde: number) {
    if (!Array.isArray(path)) path = [path];
    if (builder.revalidates.find((r: any) => r.path === path)) return;
    for (const p of path) {
        builder.revalidates.push({
            path: p,
            time: seconde * 1000,
        });
    }
}

