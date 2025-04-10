import { RequestContext } from "../../internal/server/context.ts";
import { useContext } from "react";

export function useRequest() {
  return useContext(RequestContext);
}
