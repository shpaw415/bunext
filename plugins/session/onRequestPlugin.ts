import type { BunextPlugin } from "plugins/types";
import type { SessionPluginContext } from ".";


declare global {
    var __PUBLIC_SESSION_DATA__: Record<string, unknown> | null | undefined;
    var __SESSION_TIMEOUT__: number | null;
}

export default {
    name: "bunext-on-request-plugin",
    router: {
        request(manager) {
            if (!manager.bunextReq.isAskingHTML || !manager.bunextReq.isResponseSetted()) return;

            const { session, __bunext_session_timeout__ } = manager.bunextReq.getContext<SessionPluginContext>();
            if (!session.isInitialized() || session.isSessionDeleted()) return;

            manager.bunextReq.InjectGlobalValues({
                __SESSION_TIMEOUT__: __bunext_session_timeout__,
                __PUBLIC_SESSION_DATA__: session.getPublicData(),
            });
        },
    }
} as BunextPlugin;