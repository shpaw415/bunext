import type { BunextRequest as _BunextReq } from "../../../internal/server/bunextRequest";
import type { useRequest } from "../hooks";
import { GetRequest } from "../bunextRequest";

// Bunext Global object type

export type _Request = {
  bunext: typeof _BunextReq;
  hook: {
    /**
     * A hook that return the BunextRequest accessible in a server context
     */
    useRequest: typeof useRequest;
  };
  get: {
    request: typeof GetRequest;
  };
};
