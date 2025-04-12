import type { BunextRequest } from "../../../internal/server/bunextRequest";

export type HTML_Rewrite_plugin_function = (
  reWriter: HTMLRewriter,
  bunextRequest: BunextRequest
) => void | Promise<void>;
