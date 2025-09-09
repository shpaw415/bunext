"server only";

import type { BunextPlugin } from "plugins/types";
import { SessionAPIEndPoints } from "./endPoints";
import type { SessionPluginContext } from ".";

export default {
    name: "bunext-session-API-endpoints",
    priority: 0,
    router: {
        async request(manager) {
            if (manager.bunextReq.isResponseSetted()) return;
            const { session, __INIT_SESSION__ } = manager.bunextReq.getContext<SessionPluginContext>();

            switch (manager.bunextReq.URL.pathname) {
                case SessionAPIEndPoints.delete:
                    await __INIT_SESSION__();
                    session.delete();
                    manager.bunextReq.setResponse("session deleted");
                    break;
                case SessionAPIEndPoints.getData:
                    await __INIT_SESSION__();
                    manager.bunextReq.setResponse(
                        JSON.stringify(session.getPublicData()),
                        {
                            headers: {
                                "Content-Type": "application/json",
                            },
                        }
                    );
                    break;
                default:
                    break;
            }

        }
    },
} as BunextPlugin;