import type { BunextRequest } from "../../internal/server/bunextRequest";

/**
 * insert global data to the request in direct access for SSR.
 */
export type Client_Global_Data = (
  request: BunextRequest
) => Record<string, string> | undefined;
