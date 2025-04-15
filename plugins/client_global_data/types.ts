import type { BunextRequest } from "../../internal/server/bunextRequest";

type ResType = Record<string, string> | undefined | void;

/**
 * insert global data to the request in direct access for SSR.
 */
export type Client_Global_Data = (
  request: BunextRequest
) => Promise<ResType> | ResType;
