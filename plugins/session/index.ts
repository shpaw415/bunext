"server only";

import type { BunextPlugin } from "plugins/types";
import { BunextSession, NewSessionCookieName, SessionTimeoutheaderName, type InAppSession } from "./client";
import type { SessionData } from "./common";
import { getSessionById, deleteSessionById } from "./hard";
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
    __bunext_session_timeout__: number | null;
};

type CookieStructureTypeDatabaseHard = {
    id: string;
};
type CookieStructureTypeCookie = Record<string, unknown>;

type CookieStructures = CookieStructureTypeDatabaseHard | CookieStructureTypeCookie;



function getSessionDataFromDatabaseHard(id: string): Promise<SessionData<unknown> | null> {
    return getSessionById(id);
}

async function getSessionByConfigType(cookieValue?: CookieStructures): Promise<SessionData<unknown> | null> {
    if (!cookieValue) return null;
    switch (globalThis.serverConfig.session?.type) {
        case "database:hard":
            return await getSessionDataFromDatabaseHard((cookieValue as CookieStructureTypeDatabaseHard).id);
        case "cookie":
            return cookieValue as SessionData<unknown>;
        case undefined:
            return null;
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
                sessionTimeout: globalThis?.serverConfig?.session?.timeout,
                request: manager.bunextReq,
            });

            manager.bunextReq.setContext<SessionPluginContext>({
                session,
                async __INIT_SESSION__() {
                    if (session.isInitialized()) return;
                    const cookieValue = manager.bunextReq.getCookie(SessionCookieName, true);
                    session.init(await getSessionByConfigType(cookieValue));
                    session._setExists(Boolean(cookieValue));

                    const createdAt =
                        session.getData<"private">()?.__BUNEXT_SESSION_CREATED_AT__ || 0;

                    const sessionTimeout =
                        createdAt === 0
                            ? 0
                            : createdAt +
                            session.sessionTimeoutFromNow * 1000 -
                            (new Date().getTime() - createdAt);

                    manager.bunextReq.setContext<Partial<SessionPluginContext>>({
                        __bunext_session_timeout__: sessionTimeout
                    })
                },
                __bunext_session_timeout__: null,
            });

        },
        async after_request(manager) {
            const { session, __bunext_session_timeout__ } = manager.bunextReq.getContext<SessionPluginContext>();
            if (!session.isInitialized() || !manager.bunextReq.response) return;

            if (session.isSessionDeleted()) {
                await deleteSessionByConfigType(manager);
            } else if (!session.isSessionUpdated()) return;

            const publicData = session.getPublicData();
            if (!publicData) return;
            manager.bunextReq.setCookie(NewSessionCookieName, publicData, { httpOnly: false, encrypted: false });
            manager.bunextReq.response.headers.set(SessionTimeoutheaderName, JSON.stringify(__bunext_session_timeout__));
        },

    }
} as BunextPlugin;