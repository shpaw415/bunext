import type { BunextPlugin } from "plugins/types";
import { InitServerActions, onRequestServerAction, ServerActionCompiler, ServerActionToTag, ServerComponentsToTag } from "./serverActions";
import { builder } from "internal/server/build";
import { basename, join, normalize } from "path";
import { onRequestSSRPage, clearSSRPage, ServerComponentsCompiler, initSSRPage } from "./ssr-page";
import { generateRandomString } from "features/utils";
import { serverSidePropsAfterRequestHandler, serveServerSideProps, setGlobalServerSidePropsIfNeeded } from "./serverSideProps";
import { serveDynamicPage } from "./dynamic-page";
import { getRelatedCssContent } from "./style-insert";
import { sessionOnRequestHandler } from "plugins/session";
import { serveFromBuildDirectory } from "./build-dir";
import { serveFromNodeModule } from "./node-modules";
import { serveStaticAssets } from "./static-path";


const serverOnlyFilePaths: string[] = [];

export default {
    priority: 1,
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
            for await (const handler of [
                serveFromBuildDirectory,
                serveStaticAssets,
                serveFromNodeModule,
                sessionOnRequestHandler,
                onRequestServerAction,
                serveServerSideProps,
                onRequestSSRPage,
                serveDynamicPage
            ]) {
                if (manager.bunextReq.isResponseSetted()) break;
                await handler(manager);
            }
            setGlobalServerSidePropsIfNeeded(manager);
        },
        after_request(manager) {
            return serverSidePropsAfterRequestHandler(manager);
        }
    },

    build: {
        plugin: {
            name: "server-features",
            target: "browser",
            setup(build) {
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
                    async ({ path }) => {
                        let fileContent = await Bun.file(path).text();
                        if (isServerOnly(fileContent)) {
                            return {
                                contents: "",
                                loader: "js",
                            };
                        }
                        const _module_ = await import(
                            process.env.NODE_ENV == "production"
                                ? path
                                : path + `?${generateRandomString(5)}`
                        ) as Record<string, unknown>;
                        if (
                            ["layout.tsx"]
                                .map((endsWith) => path.endsWith(endsWith))
                                .filter((t) => t == true).length > 0
                        ) {
                            return {
                                contents: fileContent,
                                loader: "tsx",
                            };
                        }

                        if (builder.isUseClient(fileContent))
                            return {
                                contents: await ClientSideFeatures(fileContent, path, _module_),
                                loader: "js",
                            };

                        const serverComponents = await ServerComponentsToTag(
                            path,
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
                            modulePath: path,
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
                    async ({ path }) => {

                        const fileContent = await Bun.file(path).text();
                        if (isServerOnly(fileContent)) {
                            return {
                                contents: "",
                                loader: "js",
                            };
                        }

                        return {
                            contents: await ClientSideFeatures(
                                fileContent,
                                path,
                                await import(
                                    process.env.NODE_ENV == "production"
                                        ? path
                                        : path + `?${generateRandomString(5)}`
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
                            )
                        ) {
                            return returnEmptyFile(loader);
                        }
                        const fileText = await Bun.file(path).text();
                        if (serverOnlyFilePaths.includes(path)) {
                            return returnEmptyFile(loader);
                        } else if (isServerOnly(fileText)) {
                            serverOnlyFilePaths.push(path);
                            return returnEmptyFile(loader);
                        }

                        return {
                            contents: fileText,
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
    },

} as BunextPlugin;



function isServerOnly(fileContent: string): boolean {
    // Trim whitespace and get the first few lines
    const trimmedContent = fileContent.trim();

    // Check for various "server only" directive formats
    const serverOnlyPatterns = [
        /^["']server only["'];?\s*$/m,           // "server only" or 'server only'
        /^\/\*\s*server only\s*\*\/\s*$/m,      // /* server only */
        /^\/\/\s*server only\s*$/m,             // // server only
        /^["']use server only["'];?\s*$/m,      // "use server only"
        /^\/\*\s*@server-only\s*\*\/\s*$/m,     // /* @server-only */
        /^\/\/\s*@server-only\s*$/m             // // @server-only
    ];

    // Check if any of the patterns match at the beginning of the file
    return serverOnlyPatterns.some(pattern => {
        const match = trimmedContent.match(pattern);
        return match && match.index === 0;
    });
}

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