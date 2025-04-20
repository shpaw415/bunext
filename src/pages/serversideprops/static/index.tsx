"use static";

import { BunextRequest } from "bunext-js/internal/server/bunextRequest.ts";

export function getServerSideProps(
  { params, request }: { params: {}; request: Request },
  bunextReq: typeof Bunext.request.bunext
) {
  if (!Boolean(params)) throw new Error("No params");
  if (!Boolean(request)) throw new Error("No request");
  else if (request instanceof Request == false)
    throw new Error("request is not instance of Request");
  if (!Boolean(bunextReq)) throw new Error("No bunextRequest");
  else if (bunextReq instanceof BunextRequest == false) {
    throw new Error("bunextRequest is not instance of BunextRequest");
  }

  return {
    params,
    redirect: "/",
  };
}

export default function StaticPage() {
  return <></>;
}
