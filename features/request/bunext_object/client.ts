import { useRequest } from "../hooks";
import type { _Request } from "./types";

const BunextRequest: _Request = {
  bunext: undefined as any,
  hook: {
    useRequest,
  },
  get: {
    request: undefined as any,
  },
};

export default BunextRequest;
