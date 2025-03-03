import { createContext } from "react";
import type { BunextRequest } from "./bunextRequest";

export const RequestContext = createContext<BunextRequest | undefined>(
  undefined
);
