
import { GetRequest } from "../bunextRequest";
import { useRequest } from "../hooks";
import { BunextRequest } from "public/request";
import type { _Request } from "./types";

let _BunextRequestClass: any = null;

const _BunextRequest = {
  bunext: BunextRequest,
  hook: {
    useRequest,
  },
  get: {
    request: GetRequest,
  },
};

export default _BunextRequest;
