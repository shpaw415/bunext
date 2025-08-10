import { type BunextPlugin } from "plugins/types";
import "internal/server/server_global";
import RobotText from "robots.txt";
export default {
    router: {
        request(request) {
            try {
                if (request.URL.pathname === "/robots.txt") {
                    return request.__SET_RESPONSE__(
                        new Response(
                            globalThis.serverConfig?.robots_txt ?? RobotText,
                            {
                                headers: { "Content-Type": "text/plain" },
                            }
                        )
                    );
                }
            } catch (error) {
                console.error("Error handling robots.txt request:", error);
            }
        }
    }
} as BunextPlugin
