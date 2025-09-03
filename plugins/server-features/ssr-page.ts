"server only";

import type { FileSystemRouter, MatchedRoute } from "bun";
import { CacheManagerPool } from "internal/caching";
import { router, type RequestManager } from "internal/server/router";
import type { ClusterMessageType, PageModule, ssrElement, SSRPage } from "internal/types";
import { createElement, isValidElement, type JSX } from "react";
import { join } from "path";
import type { Table } from "database/class";
import { builder } from "internal/server/build";
import type { DBSchema } from "database/schema";
import { generateRandomString } from "features/utils";
import reactElementToJSXString from "internal/jsxToString";
import { renderToString } from "react-dom/server";
import { normalize, resolve } from "path";
import { baseDir, pageDir } from "internal/server/server_global";
import { Wrapper } from "./ssr-page-preload";
import type { PreBuildContextDefaultValues } from "plugins/types";
import { pluginLoader } from "internal/server/plugin-loader";

const Schema: DBSchema = [
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
            {
                name: "wrapped",
                type: "boolean",
                default: false
            }
        ],
    },
];
const DBPath = join(import.meta.dirname, "ssr_cache.sqlite");
class SSRPageCache {

    private poolManager!: CacheManagerPool;

    static async create() {
        const instance = new SSRPageCache();
        await instance.initialize();
        return instance;
    }

    async initialize() {
        this.poolManager = await CacheManagerPool.create({ dbPath: DBPath, schema: Schema });
    }

    private ssr<T>(callback: (table: Table<ssrElement, ssrElement>) => T | Promise<T>) {
        return this.poolManager.getTable<ssrElement, ssrElement>("ssr", callback) as Promise<T>;
    }
    private page<T>(callback: (table: Table<SSRPage, SSRPage>) => T | Promise<T>) {
        return this.poolManager.getTable<SSRPage, SSRPage>("page", callback) as Promise<T>;
    }

    //SSR Default Page

    addSSRDefaultPage(route: string, content: string, wrapped: boolean = false) {

        return this.page(t => t.upsert([{ route, content, wrapped }], ["route"]));
    }
    async getSSRDefaultPage(route: string) {
        return (await this.page(t => t
            .select({
                where: {
                    route,
                },
                select: {
                    content: true,
                    wrapped: true
                },
                limit: 1
            }))).at(0);
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


export const SSRCache = await SSRPageCache.create();

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
                "content-type": "text/html",
                "cache-control": "no-cache"
            }
        });
        return true;
    }
    return false;
}

/**
 * Wraps the given HTML page with the necessary layout and shell.
 * @param manager The request manager.
 * @param HTMLPage The HTML page to wrap.
 * @returns The wrapped HTML page as a string.
 */
async function WrapPage(manager: RequestManager, HTMLPage: string) {
    return manager.JSXToString(
        await manager.WrapPageWithShell(
            await manager.router.stackLayouts(
                manager.serverSide as MatchedRoute,
                HTMLJSXWrapper(HTMLPage)
            )
        )
    );
}


async function getSSRDefaultPage(manager: RequestManager): Promise<string | null> {
    if (!isSSRDefaultExportPath(manager, true) || !manager.serverSide)
        return null;
    const cache = (await SSRCache.getSSRDefaultPage(manager.serverSide.name));
    if (cache) {
        if (cache.wrapped === false) {
            const wrappedPage = await WrapPage(manager, cache.content);
            await SSRCache.addSSRDefaultPage(manager.serverSide.name, wrappedPage, true);
            return wrappedPage;
        }
        return cache.content;
    }


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


const fullPagePath = join(baseDir, pageDir);
const testAgainstExt = ["ts", "tsx"];
const moduleImports = new Map<string, string[]>();


class PreBuildContext {
    private paths: Set<string> = new Set();
    private MainRoute: string | undefined;
    private MainModulePath: string | undefined;
    private plugins = pluginLoader.getPluginByName("pre_build_context");

    private async getPluginContexts(): Promise<Record<string, unknown>> {
        return Object.assign({}, ...await Promise.all(this.plugins.map((context) => {
            try {
                return context.pluginParent.init_context()
            } catch (e) {
                throw new Error(`Error while initializing plugin context, name: ${context.name}`, { cause: e as Error })
            }
        }))) || {} as Record<string, unknown>;
    }

    getAfterPluginContextCallback() {
        return this.plugins.map((context) => context.pluginParent.after_pre_build);
    }

    async preBuild(modulePath: string) {
        if (this.paths.has(modulePath) || modulePath.endsWith(".d.ts")) return;
        this.paths.add(modulePath);

        if (!this.MainRoute) this.MainRoute = Object.entries(router.server.routes).find(([_, route]) => route === modulePath)?.[0];
        if (!this.MainModulePath) this.MainModulePath = modulePath;

        const _module = (await import(
            modulePath + this.getDevKey()
        ) as Record<string, unknown>);
        if (await router.fileDirectives.pathIs("use-client", modulePath)) return;


        const existingImports = await this.getModuleImportsFromFilePath(modulePath);

        const moduleSSR =
            await SSRCache.getSSR(modulePath) || await SSRCache.addSSR(modulePath, []);

        await Promise.all(existingImports.map((imp) => this.preBuild(imp)));

        await Promise.all(
            Object.keys(_module).map(async (ex) => {
                try {

                    const exported = _module[ex] as (() => JSX.Element | Promise<JSX.Element>) | unknown;
                    if (
                        typeof exported != "function" ||
                        exported.name.startsWith("Server") ||
                        exported.name == "getServerSideProps" ||
                        exported.length > 0
                    )
                        return;

                    const contexts = {
                        ...(await this.getPluginContexts()),
                        route: this.MainRoute
                    } as Record<string, unknown> & PreBuildContextDefaultValues;

                    const WrappedElement = await Wrapper(exported as () => Promise<JSX.Element>, contexts);
                    const element = (WrappedElement.props as { children: JSX.Element }).children;

                    if (!isValidElement(element)) return;

                    const SSRelement = moduleSSR.elements.find(
                        (e) => e.tag == `<!Bunext_Element_${exported.name}!>`
                    );

                    const compiledElements = {
                        reactElement: this.toJSX(element),
                        htmlElement: renderToString(WrappedElement),
                    };

                    if (SSRelement) {
                        SSRelement.reactElement = compiledElements.reactElement;
                        SSRelement.htmlElement = compiledElements.htmlElement;

                    } else {
                        moduleSSR.elements.push({
                            tag: `<!Bunext_Element_${exported.name}!>`,
                            htmlElement: compiledElements.htmlElement,
                            reactElement: compiledElements.reactElement,
                            name: exported.name
                        });
                    }

                    if (this.MainRoute && this.MainModulePath == modulePath) {
                        await SSRCache.addSSRDefaultPage(this.MainRoute, compiledElements.htmlElement);
                    }

                    await Promise.all(this.getAfterPluginContextCallback().map((callback) => callback(contexts)));

                } catch (e) {
                    console.error("PreBuild Error:", e);
                    return;
                }
            })
        );

        if (moduleSSR.elements.length > 0) await SSRCache.addSSR(modulePath, moduleSSR.elements);
    }


    private getDevKey() {
        return process.env.NODE_ENV == "development"
            ? `?${generateRandomString(5)}`
            : "";
    }
    private onProduction(callback: () => void) {
        if (process.env.NODE_ENV == "production") {
            callback();
        }
    }
    private async testExists(e: string) {
        for await (const ext of testAgainstExt) {
            const fullName = `${e}.${ext}`;
            if (await Bun.file(fullName).exists()) {
                return fullName;
            }
        }
        return undefined;
    }
    private async getModuleImportsFromFilePath(modulePath: string): Promise<string[]> {
        this.onProduction(() => {
            const res = moduleImports.get(modulePath);
            if (res) return res;
        });

        const imports = new Bun.Transpiler({
            "loader": "tsx"
        }).scanImports(await Bun.file(modulePath).text());


        const filtered = imports.map((el) => {
            try { return Bun.fileURLToPath(import.meta.resolve(el.path, modulePath)) } catch (e) {
                console.error("Error resolving import path:", el.path, "from", modulePath, e);
                return undefined;
            }
        }).filter((e) => e != undefined && e.startsWith(fullPagePath)) as string[];

        const existingFiles = (await Promise.all(filtered.map(this.testExists))).filter((e) => e != undefined) as string[];

        this.onProduction(() => {
            moduleImports.set(modulePath, existingFiles);
        });

        return existingFiles;

    }
    private toJSX(el: JSX.Element) {
        return reactElementToJSXString(el, {
            showFunctions: true,
            showDefaultProps: true,
            useFragmentShortSyntax: true,
            sortProps: false,
            useBooleanShorthandSyntax: false,
        });
    }
}

export async function preBuild(modulePath: string): Promise<void> {
    await pluginLoader.init();
    await router.init();
    await builder.init();

    const context = new PreBuildContext();
    await context.preBuild(modulePath);

}
export async function preBuildAll(skip?: ssrElement[]) {
    const files = await Array.fromAsync(
        builder.glob(
            fullPagePath
        )
    );
    for await (const file of files) {
        if (skip?.find((e) => e.path == file)) continue;
        await preBuild(file);
    }
}


export async function resetPath(path: string) {
    const ssr = await SSRCache.getSSR(path);
    if (!ssr) {
        return false;
    }
    if (process.env.NODE_ENV == "production") {
        const extensions = ["tsx", "jsx"];
        for (const imp of new Bun.Transpiler({
            loader: path.split(".").at(-1) as Bun.JavaScriptLoader,
        })
            .scanImports(await Bun.file(path).text())
            .map((e) => e.path)) {
            if (imp.startsWith(".")) {
                const _path = path.split("/");
                _path.pop();
                const resolvedPath = resolve(normalize("/" + join(..._path)), imp);
                for await (const ext of extensions) {
                    const i = await SSRCache.getSSR(`${resolvedPath}.${ext}`);
                    if (i) await SSRCache.deleteSSR(i.path);
                }
                continue;
            }
            const absolutePath = Bun.fileURLToPath(
                import.meta.resolve?.(imp) || ""
            );
            await SSRCache.deleteSSR(absolutePath);
        }
    }
    await SSRCache.deleteSSR(ssr.path);
    return true;
}


export async function findPathIndex(path: string): Promise<boolean> {
    return Boolean(await SSRCache.getSSR(path));
}

export async function revalidate(...path: string[]) {
    const _paths = path.map((p) => findRouteOrThrow(p));

    const route = (await Promise.all(_paths
        .map(async (route) => {
            const res = await findPathIndex(route.filePath);
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
    await Promise.all(route.map(({ filePath }) => resetPath(filePath)));
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