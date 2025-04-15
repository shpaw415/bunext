import { BunextRequest } from "../../../internal/server/bunextRequest";
import { GetRequest } from "../bunextRequest";
import { useRequest } from "../hooks";
import type { _Request } from "./types";

const _BunextRequest: _Request = {
  bunext: BunextRequest,
  hook: {
    useRequest,
  },
  get: {
    request: GetRequest,
  },
};

export default _BunextRequest;
