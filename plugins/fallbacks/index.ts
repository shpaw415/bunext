import type { BunextPlugin } from "plugins/types";
import { join, normalize } from "node:path";
import { router } from "internal/server/router";

declare global {
    var __LOADING_COMPONENTS__: string[];
    var __ERROR_COMPONENTS__: string[];
}


const cwd = process.cwd();
function getLoadingComponentPath(absolute = false) {
    return Array.fromAsync(new Bun.Glob("**/loading.tsx").scan({
        cwd: join(cwd, router.pageDir),
        absolute,
        onlyFiles: true,
    }));
}
function getErrorComponentPath(absolute = false) {
    return Array.fromAsync(new Bun.Glob("**/error.tsx").scan({
        cwd: join(cwd, router.pageDir),
        absolute,
        onlyFiles: true,
    }));
}

let loadingComponentAbsolute: Array<string> = [];
/** converted to .js */
let loadingComponentRelative: Array<string> = [];

let errorComponentAbsolute: Array<string> = [];
/** converted to .js */
let errorComponentRelative: Array<string> = [];


async function reset() {
    const [
        loadingAbsolute,
        loadingRelative,
        errorAbsolute,
        errorRelative
    ] = await Promise.all([
        (await getLoadingComponentPath(true)),
        (await getLoadingComponentPath(false)).map((p) => ["/", router.pageDir, "/", p.replace(/\.tsx?$/, ".js")].join("")),
        (await getErrorComponentPath(true)),
        (await getErrorComponentPath(false)).map((p) => ["/", router.pageDir, "/", p.replace(/\.tsx?$/, ".js")].join(""))
    ]);

    loadingComponentAbsolute = [];
    loadingComponentAbsolute.push(...loadingAbsolute);

    loadingComponentRelative = [];
    loadingComponentRelative.push(...loadingRelative);

    errorComponentAbsolute = [];
    errorComponentAbsolute.push(...errorAbsolute);

    errorComponentRelative = [];
    errorComponentRelative.push(...errorRelative);
}


export default {
    name: "fallback-component-plugin",
    router: {
        async request(manager) {
            if (!manager.bunextReq.isAskingHTML) return;

            manager.bunextReq.InjectGlobalValues({
                __LOADING_COMPONENTS__: loadingComponentRelative,
                __ERROR_COMPONENTS__: errorComponentRelative
            });
        }
    },
    build_worker: {
        async before_build() {
            if (process.env.NODE_ENV !== "development") return;
            await reset();
        },
    },
    build: {
        buildOptions: () => {
            return {
                entrypoints: [...loadingComponentAbsolute, ...errorComponentAbsolute]
            }
        }
    },
    serverStart: {
        async main() {
            await reset();
        },
    },
    async onFileSystemChange() {
        await reset();
    }

} as BunextPlugin;