import { type BunextPlugin } from "plugins/types";
import "internal/server/server_global";
import RobotText from "./robots.txt";

export default {
    priority: 0,
    name: "bunext-robots-text-plugin",
    router: {
        request(request) {
            try {
                if (request.bunextReq.URL.pathname === "/robots.txt" && !request.bunextReq.isResponseSetted()) {
                    request.bunextReq.setResponse(
                        globalThis.serverConfig?.robots_txt ?? RobotText,
                        { headers: { "Content-Type": "text/plain" } }
                    ).sendNow();
                }
            } catch (error) {
                console.error("Error handling robots.txt request:", error);
            }
        }
    }
} as BunextPlugin
