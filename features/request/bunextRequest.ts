"server only";

import type { RequestManager } from "internal/server/router";


function getRequestManager(args: IArguments): RequestManager | undefined {
  return Array.from<RequestManager | undefined>(args).at(-1);
}


/**
 * get BunextRequest Object from a server context ( ServerAction, getServerSideProps )
 * @param args arguments
 * @example GetRequest(arguments)
 */
export function getRequest(args: IArguments) {
  const req = getRequestManager(args)?.request;
  if (!req) throw new Error("request is not defined ensure you are calling this function in top level of a server context");
  return req;
}

export function getBunextRequest(args: IArguments) {
  const req = getRequestManager(args)?.bunextReq;
  if (!req) throw new Error("request is not defined ensure you are calling this function in top level of a server context");
  return req;

}