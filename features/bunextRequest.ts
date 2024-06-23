import type { BunextRequest as _BunextRequest } from "../internal/bunextRequest";
export type BunextRequest = _BunextRequest;

/**
 *
 * @param args arguments
 * @example GetBunextRequest(arguments)
 */
export function GetBunextRequest(args: IArguments) {
  return Array.from(args).at(-1) as BunextRequest;
}
