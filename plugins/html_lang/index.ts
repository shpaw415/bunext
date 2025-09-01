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
            return (await globalThis.serverConfig.html_lang(bunext)) || "en";
        default:
            return "en";
    }
}

export default {
    name: "bunext-html-lang-plugin",
    priority: 1,
    router: {
        async request(req) {
            if (!req.bunextReq.isAskingHTML && !req.bunextReq.isClientNavigating || req.bunextReq.isResponseSetted()) return;

            const lang = await getHtmlLang(req.bunextReq);
            req.bunextReq.InjectGlobalValues({
                __HTML_LANG__: lang
            });
            req.bunextReq.setContext({
                __HTML_LANG__: lang
            })
        }
    },


} as BunextPlugin;