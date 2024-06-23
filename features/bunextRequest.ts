import type { BunextRequest as _BunextRequest } from "../internal/bunextRequest";
export type BunextRequest = _BunextRequest;

function GetBunextRequest(args: IArguments) {
  return Array.from(args).at(-1) as BunextRequest;
}

/**
 *
 * @param args arguments
 * @example GetSession(arguments)
 */
export function GetSession(args: IArguments) {
  return GetBunextRequest(args).session;
}
/**
 *
 * @param args arguments
 * @example GetRequest(arguments)
 */
export function GetRequest(args: IArguments) {
  return GetBunextRequest(args).request;
}
