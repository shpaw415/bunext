import { BunextRequest } from "../../../internal/server/bunextRequest";
import { useRequest } from "../hooks";
import type { _Request } from "./types";

const _BunextRequest: _Request = {
  bunext: BunextRequest,
  hook: {
    useRequest,
  },
};

export default _BunextRequest;
