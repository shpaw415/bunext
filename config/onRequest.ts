// bypass the server Response and return a custom response or
// return void otherwise

import type { OnRequestType } from "bunext-js/internal/types.ts";

const onRequest: OnRequestType = async (request) => {};

export default onRequest;
