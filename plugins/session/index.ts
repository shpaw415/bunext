import type { RequestManager } from "internal/server/router";
import type { BunextPlugin } from "plugins/types";
import { BunextRequest } from "public/request";


async function serveSessionData(req: BunextRequest): Promise<void> {
    await req.session.initData();
    req.setResponse(
        JSON.stringify(req.session.getPublicData()),
        {
            headers: {
                "Content-Type": "application/json",
            },
        }
    );
}

async function serveDeleteSession(req: BunextRequest): Promise<void> {
    await req.session.initData();
    req.session.delete();
    req.__BYPASS_RESPONSE__ = new Response("session deleted");
}

export async function sessionOnRequestHandler(request: RequestManager): Promise<Boolean> {
    switch (request.bunextReq.URL.pathname) {
        case "/bunextgetSessionData":
            await serveSessionData(request.bunextReq);
            return true;
        case "/bunextDeleteSession":
            await serveDeleteSession(request.bunextReq);
            return true;
    }
    return false;
}

export default {
    priority: 0,
    router: {
        after_request(request, response) {
            if (!request.bunextReq.session.isSessionUpdated() && !request.bunextReq.session.isSessionDeleted()) return;
            request.bunextReq.setSessionCookie(response);
        },

    },
} as BunextPlugin;