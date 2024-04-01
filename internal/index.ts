export { webToken } from "@bunpmjs/json-webtoken";

export const isServer = typeof window === "undefined" ? true : false;
