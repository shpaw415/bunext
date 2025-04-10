import type { BunextRequest as _BunextReq } from "../../../internal/server/bunextRequest";
import type { useRequest } from "../hooks";

// Bunext Global object type

export type _Request = {
  bunext: typeof _BunextReq;
  hook: {
    /**
     * A hook that return the BunextRequest accessible in a server context
     */
    useRequest: typeof useRequest;
  };
};
