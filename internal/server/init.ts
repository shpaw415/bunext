import { builder } from "./build";
import { initBunextGlobal } from "../bunext_global";
import { pluginLoader } from "./plugin-loader";
import { router } from "./router";


let initialized = false;

export async function initServerSide() {
    if (initialized) return;
    initialized = true;
    await pluginLoader.init();
    await router.init();
    await builder.init();
    await initBunextGlobal();
}