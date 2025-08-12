import type { BunextPlugin } from "plugins/types";
import type { BunextRequest } from "public/request";


async function serveSessionData(req: BunextRequest): Promise<BunextRequest> {
    await req.session.initData();
    req.setResponse(
        new Response(JSON.stringify(req.session.getPublicData()))
    );
    return req
}

async function serveDeleteSession(req: BunextRequest): Promise<BunextRequest> {
    await req.session.initData();
    req.session.delete();
    return req;

}

export default {
    router: {
        request(request) {
            switch (request.URL.pathname) {
                case "/bunextgetSessionData":
                    return serveSessionData(request);
                case "/bunextDeleteSession":
                    return serveDeleteSession(request);
            }
        },
        after_request(request) {
            if (!request.session.isSessionUpdated() && !request.session.isSessionDeleted()) return;
            request.setSessionCookie();
        }
    }
} as BunextPlugin;