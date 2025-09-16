import type { BunextPlugin } from "plugins/types";
import { InitServerActions } from "./serverActions";
import { onRequestSSRPage, clearSSRPage, initSSRPage } from "./ssr-page";
import { serveDynamicPage } from "./dynamic-page";
import { getRelatedCssContent } from "./style-insert";



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

    async onFileSystemChange() {
        await InitServerActions();
        await initSSRPage();
        //await SSRCache.clearSSR();
    },
} as BunextPlugin;