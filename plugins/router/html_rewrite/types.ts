import type { BunextRequest } from "../../../internal/server/bunextRequest";

export type HTML_Rewrite_plugin_function<T = unknown> = {
  initContext?: (req: BunextRequest) => T;
  rewrite?: (
    reWriter: HTMLRewriter,
    bunextRequest: BunextRequest,
    context: T
  ) => void | Promise<void>;
  after?: (context: T, bunextRequest: BunextRequest) => void | Promise<void>;
};
