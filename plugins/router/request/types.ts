import type { BunextRequest } from "../../../internal/server/bunextRequest";

export type Request_Plugin = (
  request: BunextRequest
) =>
  | Promise<void | undefined | BunextRequest>
  | void
  | undefined
  | BunextRequest;
