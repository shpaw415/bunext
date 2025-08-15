import type { BunextRequest } from "public/request";


export function isAskingHTML(req: BunextRequest): boolean {
    if (
        req.request.headers.get("Accept")?.includes("text/html") &&
        req.request.method.toUpperCase() == "GET") return true;
    return false;
}