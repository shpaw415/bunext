import { builder } from "./build";
import { initBunextGlobal } from "./bunext_global";
import { pluginLoader } from "./plugin-loader";
import { router } from "./router";
import devConsole from "./logs";


export async function initServerSide(consoleInit: boolean = false) {
    await pluginLoader.init();
    await router.init();
    await builder.init();
    initBunextGlobal();
    if (consoleInit) devConsole.init();
}