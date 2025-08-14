import { type BunextPlugin } from "plugins/types";
import "internal/server/server_global";
import RobotText from "robots.txt";
export default {
    priority: 0,
    router: {
        request(request) {
            try {
                if (request.bunextReq.URL.pathname === "/robots.txt") {
                    request.bunextReq.__BYPASS_RESPONSE__ = new Response(
                        globalThis.serverConfig?.robots_txt ?? RobotText,
                        {
                            headers: { "Content-Type": "text/plain" },
                        }
                    );
                    return request;
                }
            } catch (error) {
                console.error("Error handling robots.txt request:", error);
            }
        }
    }
} as BunextPlugin
