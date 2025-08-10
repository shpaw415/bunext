import type { BunextPlugin } from "plugins/types";
import type { BunextRequest } from "public/request";

async function getHtmlLang() {
    switch (typeof globalThis.serverConfig.html_lang) {
        case "string":
            return globalThis.serverConfig.html_lang;
        case "undefined":
            return "en";
        case "function":
            return await globalThis.serverConfig.html_lang() || "en";
        default:
            return "en";
    }
}

export default {
    router: {
        html_rewrite: {
            rewrite(reWriter) {
                reWriter.on("html", {
                    async element(element) {
                        element.setAttribute("lang", await getHtmlLang());
                    }
                });
            },
        }
    },

} as BunextPlugin;