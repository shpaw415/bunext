"server only";
import type { BunextPlugin } from "plugins/types";
import type { SessionPluginContext } from ".";
import type { InitializedPrivateSessionData } from "./common";


declare global {
    var __PUBLIC_SESSION_DATA__: Record<string, unknown> | null | undefined;
    var __SESSION_PRIVATE_INIT__: InitializedPrivateSessionData | undefined
}

export default {
    name: "bunext-on-request-plugin",
    router: {
        request(manager) {
            if (!manager.bunextReq.isAskingHTML) return;

            const { session } = manager.bunextReq.getContext<SessionPluginContext>();
            if (!session.isInitialized() || session.isSessionDeleted()) return;

            manager.bunextReq.InjectGlobalValues({
                __SESSION_PRIVATE_INIT__: session._get_private_meta_data(),
                __PUBLIC_SESSION_DATA__: session.getPublicData(),
            });
        },
    }
} as BunextPlugin;