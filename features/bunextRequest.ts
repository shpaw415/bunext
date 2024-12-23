import type { BunextRequest } from "../internal/bunextRequest";
import { Session } from "@bunpmjs/bunext/features/session";
import type { InAppSession } from "./session";

const isClient = typeof window != "undefined";

function GetBunextRequest(args: IArguments) {
  return Array.from(args).at(-1) as BunextRequest;
}

/**
 *
 * @param args **Required in a server context**
 * @example GetSession(arguments)
 */
export function GetSession<DataType>(args?: IArguments) {
  if (isClient && !args) return Session as unknown as InAppSession<DataType>;
  else if (args) return GetBunextRequest(args).session as InAppSession<DataType>;
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
