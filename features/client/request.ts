import { RequestContext } from "@bunpmjs/bunext/internal/context.ts";
import { useContext } from "react";

export function useRequest() {
  return useContext(RequestContext);
}

export { type BunextRequest } from "../request";
