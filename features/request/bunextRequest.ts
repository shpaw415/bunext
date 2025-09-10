"server only";

import type { RequestManager } from "internal/server/router";
import type { BunextRequest } from "public/request";


function getRequestManager(args: IArguments): RequestManager | undefined {
  return Array.from<RequestManager | undefined>(args).at(-1);
}


/**
 * get request Object from a server context ( ServerAction, getServerSideProps )
 * @param args arguments
 * @example getRequest(arguments)
 * @returns 
 */
export function getRequest(args: IArguments): Request {
  const req = getRequestManager(args)?.request;
  if (!req) throw new Error("request is not defined ensure you are calling this function in top level of a server context");
  return req;
}
/**
 * get BunextRequest Object from a server context ( ServerAction, getServerSideProps )
 * @param args arguments
 * @example getBunextRequest(arguments)
 * @returns BunextRequest
 */
export function getBunextRequest(args: IArguments): BunextRequest {
  const req = getRequestManager(args)?.bunextReq;
  if (!req) throw new Error("request is not defined ensure you are calling this function in top level of a server context");
  return req;

}