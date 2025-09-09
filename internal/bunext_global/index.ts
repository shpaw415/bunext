import { getRequest } from "features/request/bunextRequest";
import { getSession } from "public/session";
import { useRequest } from "features/request/hooks";
import { BunextRequest } from "public/request";
import { version } from "package.json";

import { revalidateStatic } from "plugins/static_page";
import { Link } from "public/router/components";
import { revalidate, revalidateEvery } from "plugins/server-features/ssr-page";
import { usePathname } from "internal/router";
import { navigate } from "internal/router/client";

import { Database } from "database";
import { DynamicComponent } from "features/components";
import { useSession } from "public/session";

export type BunextType = {
    version: string;
    request: typeof _BunextRequest;
    router: typeof _Router;
    session: typeof _Session;
    database: typeof Database;
    components: typeof _Components;
};

function switchContext<T, K>(server: () => T, client: () => K): T {
    return (typeof window == "undefined" ? server() : client()) as T;
}
function switchContextAsClient<T, K>(server: () => T, client: () => K): K {
    return (typeof window == "undefined" ? server() : client()) as K;
}

function onClientThrow() {
    throw new Error("This function is only available on the server side");
}
function onServerThrow() {
    throw new Error("This function is only available on the client side");
}

const _BunextRequest = {
    bunext: switchContext(() => BunextRequest, () => undefined),
    hook: {
        useRequest,
    },
    get: {
        request: switchContext(() => getRequest, () => onClientThrow),
    },
};

const _Router = {
    revalidate: {
        static: switchContext(() => revalidateStatic, () => onClientThrow),
        ssr: {
            every: switchContext(() => revalidateEvery, () => onClientThrow),
            now: switchContext(() => revalidate, () => onClientThrow),
        },
    },
    hooks: {
        usePathname,
    },
    navigate: {
        to: switchContextAsClient(() => onServerThrow, () => navigate),
        components: {
            link: Link,
        },
    },
};

globalThis.Link = Link;

const _Components = {
    DynamicComponent
};

const _Session = {
    hook: {
        useSession,
    },
    get: switchContext(() => getSession, () => onClientThrow),
};

export async function initBunextGlobal(): Promise<BunextType> {

    return globalThis.Bunext ??= {
        version,
        request: _BunextRequest,
        router: _Router,
        database: switchContext(() => Database, () => undefined),
        session: _Session,
        components: _Components,
    } as BunextType;

}