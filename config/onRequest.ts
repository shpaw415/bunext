// bypass the server Response and return a custom response or
// return void otherwise

import type { OnRequestType } from "@bunpmjs/bunext/internal/types.ts";

const onRequest: OnRequestType = async (request) => {
  const res = await Bunext.plugins.onRequest.serveFrom({
    directory: "src/dynamic",
    request,
  });
  if (res) return res;
};

export default onRequest;
