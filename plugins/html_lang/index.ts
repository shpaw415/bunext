import type { BunextPlugin } from "plugins/types";
import type { BunextRequest } from "public/request";

declare global {
    var __HTML_LANG__: string | undefined;
}

async function getHtmlLang(bunext: BunextRequest) {
    switch (typeof globalThis.serverConfig.html_lang) {
        case "string":
            return globalThis.serverConfig.html_lang;
        case "undefined":
            return "en";
        case "function":
            return await globalThis.serverConfig.html_lang(bunext) || "en";
        default:
            return "en";
    }
}

export default {
    router: {
        async request(bunext) {
            bunext.InjectGlobalValues({
                __HTML_LANG__: await getHtmlLang(bunext)
            });
        }
    },


} as BunextPlugin;