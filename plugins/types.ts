import type { BunextRequest } from "../internal/server/bunextRequest";
import type { RequestManager } from "../internal/server/router";

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
    manager: RequestManager,
    context: T,
  ) => void | Promise<void>;
  after?: (context: T, manager: RequestManager, HTML: string) => void | Promise<void>;
};

export type AfterBuildMain = () => Promise<any> | any;
export type BeforeBuild = () => Promise<any> | any;

export type Request_Plugin = (
  request: RequestManager
) => Promise<void> | void;

export type AfterRequest_Plugin = (
  request: RequestManager,
  response: Response
) => Promise<void | Response> | void | Response;

type Build_Plugins = {
  plugin?: Bun.BunPlugin;
  buildOptions?: Partial<Bun.BuildConfig>;
};

type onFileSystemChangePlugin = (
  filePath: string | undefined,
  /**
   * Prevent the build from running <br />
   * This is useful if you want to prevent the build from running when a file is changed
   */
  preventBuild: () => void,
) => void | Promise<void>;

export type BunextPlugin<HTMLRewrite = unknown> = Partial<{
  /**
   * Triggered on the **Build-Worker-Thread** after the build step and passes every output BuildArtifact for processing.
   */
  after_build: (BuildArtifact: Bun.BuildArtifact) => Promise<any> | any;
  /**
   * Triggered on the main thread after the build step.
   */
  after_build_main: AfterBuildMain;
  /**
   * Triggered on the main thread before the build step.
   */
  before_build_main: BeforeBuild;
  /**
   * Add Bun.build plugins and build config
   */
  build: Build_Plugins;
  /**
   * Router related plugin section
   */
  router: Partial<{
    /**
     * Parse and rewrite HTML content before sending to the client.
     *
     * The result will be cached if it is:
     *  - SSR page component
     *  - static page (use static)
     */
    html_rewrite: HTML_Rewrite_plugin_function<HTMLRewrite>;
    /**
     * Intercept and modify requests before they are processed by the router.
     * Access the BunextRequest via manager.bunextReq
     * @example (manager: RequestManager): Promise<RequestManager> | RequestManager => {
     * // when set via __BYPASS_RESPONSE__ the HTMLRewrite plugins will be skipped
     *  manager.bunextReq.__BYPASS_RESPONSE__ = new Response("Custom response");
     *
     * // global injected value and rewrite plugin will be applied
     * manager.bunextReq.setResponse("Custom response", { headers: { "X-Custom-Header": "value" } });
     *
     * }
     */
    request: Request_Plugin;
    /**
     * Triggered after the request is processed.
     * Allows for modifying the response before it is sent to the client.
     *
     * if a response is returned this will overwrite the original response
     *
     * @example (manager: RequestManager, response: Response) => {
     *  // Modify response headers or return a new response
     *  const newHeaders = new Headers(response.headers);
     *  newHeaders.set("X-Custom-Header", "value");
     *  return new Response(response.body, { 
     *    status: response.status, 
     *    headers: newHeaders 
     *  });
     * }
     */
    after_request: AfterRequest_Plugin
  }>;
  /**
   * Triggered once when the server starts
   */
  serverStart: ServerStart;
  /**
   * Paths from node_modules to force exclusion from the build
   * @example ["my_module/serverOnly/index.ts"]
   */
  removeFromBuild: Array<string>;
  /**
   * Triggered when a change is made in ./src and ./static, (add, delete, update) a file.
   *
   * **ONLY DEV MODE**
   */
  onFileSystemChange: onFileSystemChangePlugin;

  /**
   * 0 has higher priority than 1
   */
  priority?: number;
}>
