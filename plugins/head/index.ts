"server only";
import type { BunextPlugin } from "plugins/types";
import type { ContextType, HeadData, PreBuildContextType } from "./types";
import { RewriteHeadData } from "./rewriter_utils";
import { CacheManager } from "internal/caching";
import { PreBuildContext, safeMerge } from "./utils";

declare global {
    var __HEAD_CACHE__: CacheManager<HeadData>;
}

globalThis.__HEAD_CACHE__ ??= await CacheManager.create("__HEAD_CACHE__");

export const headCache = globalThis.__HEAD_CACHE__;

export default {
    router: {
        async request(manager) {
            if (!manager.bunextReq.isAskingHTML && !manager.bunextReq.isClientNavigation()) return;

            const cachedHeadData = manager.serverSide?.name ? await headCache.get(manager.serverSide?.pathname) || undefined : {};

            const mergedHeadData = safeMerge(manager.bunextReq.getContext<ContextType>().__HEAD_DATA__, cachedHeadData) || {};

            manager.bunextReq.setContext<ContextType>({
                __HEAD_DATA__: mergedHeadData
            });
            manager.bunextReq.InjectGlobalValues({
                __HEAD_DATA__: mergedHeadData
            })
        },
        html_rewrite: {
            rewrite(reWriter, manager) {
                const headData = manager.bunextReq.getContext<ContextType>().__HEAD_DATA__;
                if (headData === undefined) return;
                reWriter.on("head", {
                    element(el) {
                        el.append(RewriteHeadData(headData), { html: true });
                    }
                });
            },
        },
    },
    pre_build_context: {
        init_context: () => ({
            __HEAD_DATA__: new PreBuildContext()
        }),
        async after_pre_build(context) {
            if (!context.__HEAD_DATA__.head) return;
            await headCache.set(context.route, context.__HEAD_DATA__.head);
        },
    }
} as BunextPlugin<undefined, PreBuildContextType>;