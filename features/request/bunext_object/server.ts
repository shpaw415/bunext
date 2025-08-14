
import { GetRequest } from "../bunextRequest";
import { useRequest } from "../hooks";
import type { _Request } from "./types";

let _BunextRequestClass: any = null;

const _BunextRequest = {
  get bunext() {
    // Lazy import to avoid circular dependency
    if (!_BunextRequestClass) {
      _BunextRequestClass = require("internal/server/bunextRequest").BunextRequest;
    }
    return _BunextRequestClass;
  },
  hook: {
    useRequest,
  },
  get: {
    request: GetRequest,
  },
};

export default _BunextRequest;
