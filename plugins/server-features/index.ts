import type { BunextPlugin } from "plugins/types";
import { InitServerActions, ServerActionCompiler, ServerActionToTag, ServerComponentsToTag } from "./serverActions";
import { builder } from "internal/server/build";
import { basename, join, normalize } from "path";
import { onRequestSSRPage, clearSSRPage, ServerComponentsCompiler, initSSRPage } from "./ssr-page";
import { generateRandomString } from "features/utils";
import { serveDynamicPage } from "./dynamic-page";
import { getRelatedCssContent } from "./style-insert";
import { router } from "internal/server/router";
import { pluginLoader } from "internal/server/plugin-loader";


type PluginCacheType<T extends "tsx" | "ts"> = {
    pluginName: string;
    func: Required<Required<Exclude<BunextPlugin["build"], undefined>>["partialPluginOverRide"]>[T];
};

declare global {
    var __PLUGIN_CACHE__: {
        ts: Array<PluginCacheType<"ts">> | null;
        tsx: Array<PluginCacheType<"tsx">> | null;
    }
}

globalThis.__PLUGIN_CACHE__ ??= {
    ts: null,
    tsx: null,
};

function getPluginInstance<T extends "tsx" | "ts">(fileExt: T): Array<PluginCacheType<T>> {

    if (globalThis.__PLUGIN_CACHE__[fileExt]) {
        return globalThis.__PLUGIN_CACHE__[fileExt] as Array<PluginCacheType<T>>;
    }

    const value = pluginLoader.getSubPluginsByParentName("build", "partialPluginOverRide")
        .map((p) => ({ pluginName: p.name, func: p.subPlugin[fileExt] }))
        .filter((p) => p.func !== undefined) as Array<PluginCacheType<T>>;
    globalThis.__PLUGIN_CACHE__[fileExt as "ts"] = value as Array<PluginCacheType<"ts">>;

    return globalThis.__PLUGIN_CACHE__[fileExt] as unknown as Array<PluginCacheType<T>>;
}


export default {
    name: "bunext-server-features",
    priority: 3,
    serverStart: {
        async main() {
            clearSSRPage();
            await InitServerActions();
            await initSSRPage();
        },
        async cluster() {
            await InitServerActions();
            await initSSRPage();
        },
    },
    router: {
        html_rewrite: {
            rewrite: (rewriter, request) => {
                rewriter.on("#BUNEXT_INNER_PAGE_INSERTER", {
                    element(element) {
                        element.removeAndKeepContent();
                    },
                });
                rewriter.on("head", {
                    async element(element) {

                        element.append(
                            [
                                `<style class="bunext-ssr-style">`,
                                await getRelatedCssContent(request),
                                "</style>"
                            ].join("\n"),
                            { html: true }
                        );
                    },
                })
            },
        },
        async request(manager) {
            if (!manager.bunextReq.match) return;
            for await (const handler of [
                onRequestSSRPage,
                serveDynamicPage,
            ]) {
                if (manager.bunextReq.isResponseSetted()) break;
                await handler(manager);
            }
        }
    },

    build: {
        plugin: {
            name: "server-features",
            target: "browser",
            async setup(build) {
                build.onLoad(
                    {
                        filter: new RegExp(
                            "^" +
                            builder.escapeRegExp(
                                normalize(
                                    join(
                                        builder.options.baseDir,
                                        builder.options.pageDir as string
                                    )
                                )
                            ) +
                            "/.*" +
                            "\\.(ts|tsx|jsx)$"
                        ),
                    },
                    async ({ path, loader, ...props }) => {
                        const fileText = await Bun.file(path).text();

                        const exports = new Bun.Transpiler({
                            loader: loader as "tsx" | "ts",
                            exports: {
                                eliminate: ["getServerSideProps"],
                            },
                        }).scan(fileText).exports;

                        return {
                            contents: `export { ${exports.join(", ")} } from 
                    ${JSON.stringify("./" + basename(path) + "?client")}`,
                            loader: "ts",
                        };
                    }
                );
                build.onResolve(
                    { filter: /\.(ts|tsx)\?client$/ },
                    async ({ importer, path }) => {
                        const url = Bun.pathToFileURL(importer);
                        const filePath = Bun.fileURLToPath(new URL(path, url));
                        return {
                            path: filePath,
                            namespace: "client",
                        };
                    }
                );
                build.onLoad(
                    { namespace: "client", filter: /\.tsx$/ },
                    async (args) => {
                        if (await router.fileDirectives.pathIs("server-only", args.path)) {
                            return {
                                contents: "",
                                loader: "js",
                            };
                        }

                        let fileContent = await Bun.file(args.path).text();
                        for await (const { pluginName, func } of getPluginInstance("tsx")) {
                            try {
                                const result = await func(args, fileContent);
                                if (result?.contents) {
                                    fileContent = result.contents;
                                }
                            } catch (e) {
                                console.error(`Error occurred while processing partialPluginOverride[tsx] plugin ${pluginName}:`);
                                throw e;
                            }
                        }

                        const _module_ = await import(
                            process.env.NODE_ENV == "production"
                                ? args.path
                                : args.path + `?${generateRandomString(5)}`
                        ) as Record<string, unknown>;
                        if (
                            ["layout.tsx"]
                                .map((endsWith) => args.path.endsWith(endsWith))
                                .filter((t) => t == true).length > 0
                        ) {
                            return {
                                contents: fileContent,
                                loader: "tsx",
                            };
                        }

                        if (await router.fileDirectives.pathIs("use-client", args.path))
                            return {
                                contents: await ClientSideFeatures(fileContent, args.path, _module_),
                                loader: "js",
                            };

                        const serverComponents = await ServerComponentsToTag(
                            args.path,
                            _module_
                        );

                        const serverComponentsForTranspiler = Object.assign(
                            {},
                            ...[
                                ...Object.keys(serverComponents).map((component) => ({
                                    [component]: serverComponents[component].tag,
                                })),
                            ]
                        ) as Record<string, string>;

                        const serverActionsTags = await ServerActionToTag(_module_);

                        const transpiler = new Bun.Transpiler({
                            loader: "tsx",
                            exports: {
                                replace: {
                                    ...serverActionsTags,
                                    ...serverComponentsForTranspiler,
                                },
                            },
                        });
                        fileContent = transpiler.transformSync(fileContent);
                        fileContent = await ServerSideFeatures({
                            modulePath: args.path,
                            fileContent: fileContent,
                            serverComponents: serverComponents,
                            module: _module_,
                        });

                        fileContent = new Bun.Transpiler({
                            loader: "jsx",
                            jsxOptimizationInline: true,
                            trimUnusedImports: true,
                            treeShaking: true,
                        }).transformSync(fileContent);

                        for (const name of Object.keys(serverComponents))
                            fileContent = fileContent.replace(
                                `function ${name}()`,
                                `function _${name}()`
                            );

                        return {
                            contents: fileContent,
                            loader: "js",
                        };
                    }
                );
                build.onLoad(
                    { namespace: "client", filter: /\.ts$/ },
                    async (args) => {
                        if (await router.fileDirectives.pathIs("server-only", args.path)) {
                            return {
                                contents: "",
                                loader: "js",
                            };
                        }

                        let fileContent = await Bun.file(args.path).text();
                        for await (const { pluginName, func } of getPluginInstance("ts")) {
                            try {
                                const result = await func(args, fileContent);
                                if (result?.contents) {
                                    fileContent = result.contents;
                                }
                            } catch (e) {
                                console.error(`Error occurred while processing partialPluginOverride[ts] plugin ${pluginName}:`);
                                throw e;
                            }
                        }

                        return {
                            contents: await ClientSideFeatures(
                                fileContent,
                                args.path,
                                await import(
                                    process.env.NODE_ENV == "production"
                                        ? args.path
                                        : args.path + `?${generateRandomString(5)}`
                                )
                            ),
                            loader: "js",

                        };
                    }
                );
                build.onLoad(
                    {
                        filter: new RegExp(
                            "^" +
                            builder.escapeRegExp(normalize(builder.options.baseDir)) +
                            "/.*" +
                            "\\.(ts|tsx)$"
                        ),
                    },
                    async ({ path, loader }) => {
                        const fileText = await Bun.file(path).text();
                        const exports = new Bun.Transpiler({
                            loader: loader as "tsx" | "ts",
                        }).scan(fileText).exports;

                        return {
                            contents: `export { ${exports.join(", ")} } from 
                    ${JSON.stringify("./" + basename(path) + "?module")}`,
                            loader: "ts",
                        };
                    }
                );
                build.onResolve(
                    { filter: /\.(ts|tsx)\?module$/ },
                    async ({ importer, path }) => {
                        const url = Bun.pathToFileURL(importer);
                        const filePath = Bun.fileURLToPath(new URL(path, url));
                        return {
                            path: filePath,
                            namespace: "module",
                        };
                    }
                );
                build.onLoad(
                    { filter: /\.(ts|tsx)$/, namespace: "module" },
                    async ({ path, loader }) => {

                        if (
                            builder.remove_node_modules_files_path.includes(
                                path.replace(builder.options.baseDir + "/node_modules/", "")
                            ) || await router.fileDirectives.pathIs("server-only", path)
                        ) {
                            return returnEmptyFile(loader);
                        }

                        return {
                            contents: await Bun.file(path).text(),
                            loader,
                        };
                    }
                );
            },
        },
    },
    async onFileSystemChange() {
        await InitServerActions();
        await initSSRPage();
        //await SSRCache.clearSSR();
    },
} as BunextPlugin;


function returnEmptyFile(loader: Bun.Loader) {
    return {
        contents: "",
        loader,
    };
}

async function ClientSideFeatures(
    fileContent: string,
    filePath: string,
    module: Record<string, unknown>
) {
    const transpiler = new Bun.Transpiler({
        loader: "tsx",
        deadCodeElimination: true,
        jsxOptimizationInline: true,
        exports: {
            replace: {
                ...(await ServerActionToTag(module)),
            },
        },
    });

    return ServerActionCompiler(
        module,
        transpiler.transformSync(fileContent),
        filePath
    );
}

async function ServerSideFeatures({
    modulePath,
    fileContent,
    serverComponents,
    module,
}: {
    modulePath: string;
    fileContent: string;
    serverComponents: {
        [key: string]: {
            tag: string; // "<!Bunext_Element_FunctionName!>"
            reactElement: string;
        };
    };
    module: Record<string, unknown>;
}) {
    fileContent = ServerActionCompiler(module, fileContent, modulePath);
    fileContent = ServerComponentsCompiler(serverComponents, fileContent);

    return fileContent;
}