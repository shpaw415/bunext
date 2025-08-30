import type { BunextType } from "../types";


export async function initClientBunext() {
  return globalThis.Bunext ??= {
    version: (await import("../../package.json")).version,
    request: (await import("../../features/request/bunext_object/client")).default,
    database: (await import("../../database/bunext_object/client")).default,
    plugins: (await import("../../plugins/bunext_object/client")).default,
    router: (await import("../../features/router/bunext_object/client")).default,
    session: (await import("../../features/session/bunext_object/client")).default,
    components: (await import("../../features/components/bunext_global/server")).default,
  } as BunextType;
}