"server only";

import type { BunextPlugin } from "plugins/types";
import { BunextSession, NewSessionHeaderName, SessionTimeoutheaderName, type InAppSession } from "./client";
import type { SessionData } from "./common";
import { getSessionById, deleteSessionById, getSessionCache } from "./hard";
import { getBunextRequest } from "features/request/bunextRequest";
import type { RequestManager } from "internal/server/router";


const SessionCookieName = "__BUNEXT_SESSION__";



export type SessionPluginContext = {
    session: BunextSession<{}>;
    /**
     * init the session data if it is disponible
     * @returns void
     */
    __INIT_SESSION__: () => Promise<void>;
};

type CookieStructureTypeDatabaseHard = {
    id: string;
};
type CookieStructureTypeCookie = Record<string, unknown>;

type CookieStructures = CookieStructureTypeDatabaseHard | CookieStructureTypeCookie;



function getSessionDataFromDatabaseHard(id: string): Promise<SessionData<{}, true> | null> {
    return getSessionById(id);
}

async function getSessionByConfigType(cookieValue?: CookieStructures): Promise<SessionData<{}, true> | null> {
    if (!cookieValue) return null;
    switch (globalThis.serverConfig.session?.type) {
        case "database:hard":
            return await getSessionDataFromDatabaseHard((cookieValue as CookieStructureTypeDatabaseHard).id);
        case "cookie":
            return cookieValue as SessionData<{}, true>;
        case undefined:
            return null;
        default:
            throw new Error("Unsupported session type");
    }
}

function getCookieValueFromConfigType(session: BunextSession<{}>): CookieStructures {
    switch (globalThis.serverConfig.session?.type) {
        case "database:hard":
            return { id: session.getSessionId() };
        case "cookie":
            return session._rawData;
        case undefined:
            throw new Error("Session is not configured");
        default:
            throw new Error("Unsupported session type");
    }
}

async function deleteSessionByConfigType(manager: RequestManager) {
    switch (globalThis.serverConfig.session?.type) {
        case "database:hard":
            const id = manager.bunextReq.getCookie<CookieStructureTypeDatabaseHard>(SessionCookieName, true)?.id;
            if (!id) throw new Error("No session id provided for deletion");
            manager.bunextReq.deleteCookie(SessionCookieName, { httpOnly: true });
            await deleteSessionById(id);
            return;
        case "cookie":
            manager.bunextReq.deleteCookie(SessionCookieName, { httpOnly: true });
            return;
        case undefined:
            return;
        default:
            throw new Error("Unsupported session type");
    }
}

/**
* get session from a server context ( ServerAction, getServerSideProps )
* @param args
* @example getSession(arguments)
*/
export function getSession<DataType extends Record<string, unknown>>(args: IArguments): InAppSession<DataType> {
    if (args) return getBunextRequest(args).getContext<SessionPluginContext>().session as unknown as InAppSession<DataType>;
    else throw new Error("you must set arguments from a server context");
}

export default {
    name: "bunext-session-plugin",
    priority: 0,
    router: {
        before_request(manager) {
            const session = new BunextSession({
                sessionTimeout: globalThis?.serverConfig?.session?.timeout || 3600,
            });

            manager.bunextReq.setContext<SessionPluginContext>({
                session,
                async __INIT_SESSION__() {
                    if (session.isInitialized()) return;
                    const cookieValue = manager.bunextReq.getCookie(SessionCookieName, true);
                    session.init(await getSessionByConfigType(cookieValue));
                },
            });

        },
        async after_request(manager) {
            const { session } = manager.bunextReq.getContext<SessionPluginContext>();
            if (!session.isInitialized() || !manager.bunextReq.response) return;

            if (session.isSessionDeleted()) {
                return await deleteSessionByConfigType(manager);
            } else if (!session.isSessionUpdated()) return;

            const rawData = session._rawData;
            const expireAt = new Date();
            expireAt.setTime(session.getExpiration());
            (await getSessionCache()).set(session.getSessionId(), rawData, expireAt);

            const publicData = session.getPublicData();
            if (!publicData) return;
            if (!manager.bunextReq.isAskingHTML) {
                manager.bunextReq.setHeader(NewSessionHeaderName, encodeURI(JSON.stringify(publicData)));
                manager.bunextReq.setHeader(SessionTimeoutheaderName, JSON.stringify(session.getExpiration()));
            }

            manager.bunextReq.setCookie(
                SessionCookieName,
                getCookieValueFromConfigType(session),
                { httpOnly: true, maxAge: Math.floor((session.getExpiration() - Date.now()) / 1000), encrypted: true }
            );
        },

    }
} as BunextPlugin;