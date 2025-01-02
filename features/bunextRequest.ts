import type { BunextRequest } from "../internal/bunextRequest";
import type { InAppSession } from "./session";

const isClient = typeof window != "undefined";

function GetBunextRequest(args: IArguments) {
  return Array.from(args).at(-1) as BunextRequest;
}

/**
 * get session from a server context
 * @param args
 * @example GetSession(arguments)
 */
export function GetSession<DataType>(args: IArguments) {
  if (args) return GetBunextRequest(args).session as InAppSession<DataType>;
  else throw new Error("you must set arguments from a server context");
}
/**
 *
 * @param args arguments
 * @example GetRequest(arguments)
 */
export function GetRequest(args: IArguments) {
  if (isClient) throw new Error("cannot call GetRequest from a client context");
  return GetBunextRequest(args).request;
}
