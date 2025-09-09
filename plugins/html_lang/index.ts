import type { BunextPlugin } from "plugins/types";
import type { BunextRequest } from "public/request";


declare global {
    /**
    * This global is for client side rendering to set the lang attribute in the HTML tag
    */
    var __HTML_LANG__: string | undefined;
}

async function getHtmlLang(bunext: BunextRequest) {
    switch (typeof globalThis.serverConfig.html_lang) {
        case "string":
            return globalThis.serverConfig.html_lang;
        case "undefined":
            return "en";
        case "function":
            return (await globalThis.serverConfig.html_lang(bunext)) || "en";
        default:
            return "en";
    }
}

export default {
    name: "bunext-html-lang-plugin",
    router: {
        async before_request(req) {
            if ((!req.bunextReq.isAskingHTML && !req.bunextReq.isClientNavigating)) return;
            const lang = { __HTML_LANG__: await getHtmlLang(req.bunextReq) };
            req.bunextReq.InjectGlobalValues(lang).setContext(lang);
        }
    },


} as BunextPlugin;