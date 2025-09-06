import { builder } from "./build";
import { initBunextGlobal } from "../bunext_global";
import { pluginLoader } from "./plugin-loader";
import { router } from "./router";


export async function initServerSide() {
    await pluginLoader.init();
    await router.init();
    await builder.init();
    await initBunextGlobal();
}