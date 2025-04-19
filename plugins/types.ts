import type { BunextRequest } from "../internal/server/bunextRequest";

export type ServerStart = Partial<{
  /**
   * executed on the main thread
   */
  main: () => Promise<any> | any;
  /**
   * executed on clusters in multi-threaded mode
   */
  cluster: () => Promise<any> | any;
  /**
   * executed on dev mode
   */
  dev: () => Promise<any> | any;
}>;

type HTML_Rewrite_plugin_function<T = unknown> = {
  initContext?: (req: BunextRequest) => T;
  rewrite?: (
    reWriter: HTMLRewriter,
    bunextRequest: BunextRequest,
    context: T
  ) => void | Promise<void>;
  after?: (context: T, bunextRequest: BunextRequest) => void | Promise<void>;
};

export type AfterBuildMain = () => Promise<any> | any;
export type BeforeBuild = () => Promise<any> | any;

export type Request_Plugin = (
  request: BunextRequest
) =>
  | Promise<void | undefined | BunextRequest>
  | void
  | undefined
  | BunextRequest;

type Build_Plugins = {
  plugin?: Bun.BunPlugin;
  buildOptions?: Partial<Bun.BuildConfig>;
};

export type BunextPlugin<HTMLRewrite = unknown> = Partial<{
  after_build: (BuildArtifact: Bun.BuildArtifact) => Promise<any> | any;
  after_build_main: AfterBuildMain;
  before_build_main: BeforeBuild;
  build: Build_Plugins;
  router: Partial<{
    html_rewrite: HTML_Rewrite_plugin_function<HTMLRewrite>;
    request: Request_Plugin;
  }>;
  serverStart: ServerStart;
  /**
   * path from node_modules to exclude from the build
   */
  removeFromBuild: Array<string>;
}>;
