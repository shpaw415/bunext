"server only";

import { CacheManager } from "internal/caching";
import type { SessionData } from "./common";
import { join } from "node:path";


declare global {
    var __BUNEXT_SESSION_CACHE__: CacheManager<SessionData<{}, true>>;
}

globalThis.__BUNEXT_SESSION_CACHE__ ??= await CacheManager.create<SessionData<{}, true>>("session", {
    dbPath: join(process.cwd(), "config", "session.sqlite"),
})

export const getSessionCache = async () => {
    return globalThis.__BUNEXT_SESSION_CACHE__;
};


export async function getSessionById(id: string) {
    return (await getSessionCache()).get(id);
}

export async function setSessionById(id: string, data: SessionData<{}, true>, expireAt: Date) {
    return (await getSessionCache()).set(id, data, expireAt);
}

export async function deleteSessionById(id: string) {
    return (await getSessionCache()).delete(id);
}

