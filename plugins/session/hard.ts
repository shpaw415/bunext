"server only";

import { CacheManager } from "internal/caching";
import type { SessionData } from "./common";
import { join } from "node:path";


let session_cache: CacheManager<SessionData<any>> | undefined;

export const getSessionCache = async () => {
    if (!session_cache) {
        session_cache = await CacheManager.create<SessionData<any>>("session", {
            dbPath: join(process.cwd(), "config", "session.sqlite"),
        });
    }
    return session_cache;
};


export async function getSessionById(id: string) {
    return (await getSessionCache()).get(id);
}

export async function setSessionById(id: string, data: SessionData<any>, expireAt: Date) {
    return (await getSessionCache()).set(id, data, expireAt);
}

export async function deleteSessionById(id: string) {
    return (await getSessionCache()).delete(id);
}

