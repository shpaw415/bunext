// bypass the server Response and return a custom response or
// return void otherwise

import type { OnRequestType } from "@bunpmjs/bunext/internal/types.ts";

const onRequest: OnRequestType = (request) => {};

export default onRequest;
