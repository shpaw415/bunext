import type { RequestManager } from "internal/server/router";
import { cleanExpiredSessions, initializeSessionDatabase } from "internal/session";
import type { BunextPlugin } from "plugins/types";
import { BunextRequest } from "public/request";


const SESSION_CLEANUP_INTERVAL = 1800 * 1000; // 30 minutes


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

async function sessionOnRequestHandler(request: RequestManager): Promise<boolean> {
    switch (request.bunextReq.URL.pathname) {
        case "/bunextgetSessionData":
            await serveSessionData(request.bunextReq);
            return true;
        case "/bunextDeleteSession":
            await serveDeleteSession(request.bunextReq);
            return true;
    }
    return false
}

async function initSessionDatabase() {
    const sessionConfigType = globalThis.serverConfig.session?.type;
    const setClearSessionInterval = () =>
        setInterval(() => cleanExpiredSessions(), SESSION_CLEANUP_INTERVAL);

    switch (sessionConfigType) {
        case "database:hard":
            await initializeSessionDatabase();
            setClearSessionInterval();
            break;
        case "database:memory":
            //if (cluster.isWorker) break;
            await initializeSessionDatabase();
            setClearSessionInterval();
            break;
    }
}

export default {
    name: "bunext-session-plugin",
    priority: 0,
    router: {
        async request(manager) {
            if (
                manager.bunextReq.isResponseSetted() ||
                await sessionOnRequestHandler(manager) ||
                !manager.bunextReq.isAskingHTML
            ) return;

            const session = manager.bunextReq.session;
            await session.initData();
            const createdAt =
                session.__DATA__.private?.__BUNEXT_SESSION_CREATED_AT__ || 0;

            const sessionTimeout =
                createdAt === 0
                    ? 0
                    : createdAt +
                    session.sessionTimeoutFromNow * 1000 -
                    (new Date().getTime() - createdAt);
            manager.bunextReq.InjectGlobalValues({
                __SESSION_TIMEOUT__: sessionTimeout,
                __PUBLIC_SESSION_DATA__: session.exists() ? session.getPublicData() : undefined,
            });

        },
        async after_request(request, response) {
            if (!request.bunextReq.session.isSessionUpdated() && !request.bunextReq.session.isSessionDeleted()) return;
            await request.bunextReq.setSessionCookie(response);
        },

    },
    serverStart: {
        main() {
            return initSessionDatabase();
        },
    },
} as BunextPlugin;