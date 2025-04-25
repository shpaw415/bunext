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

type onFileSystemChangePlugin = (filePath:string|undefined) => void | Promise<void>;

export type BunextPlugin<HTMLRewrite = unknown> = Partial<{
  /**
   * Triggered on the **Build-Worker-Thread** after the build step and passes every output BuildArtifact for processing
   * the file
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
   * Add plugins and build config 
   */
  build: Build_Plugins;
  /**
   * Router related plugin section
   */
  router: Partial<{
    /**
     * parse the entire HTML before sending to the client, and rewrite if needed.
     * 
     * The result will be cached if it is
     *  - SSR page component 
     *  - static page (use static) 
     */
    html_rewrite: HTML_Rewrite_plugin_function<HTMLRewrite>;
    /**
     * bypass the request flow and return a custom BunextResponse to the client.
     * @example (request: BunextRequest) => { 
     *  request.response = new Response("custom response"); 
     *  return request; 
     * }
     */
    request: Request_Plugin;
  }>;
  /**
   * Triggered once when the server start
   */
  serverStart: ServerStart;
  /**
   * path from node_modules to force exclusion from the build
   * @example ["my_module/serverOnly/index.ts"]
   */
  removeFromBuild: Array<string>;
  /**
   * Triggered when a change is made in ./src and ./static, (add, delete, update) a file.
   * 
   * **ONLY DEV MODE**
   */
  onFileSystemChange: onFileSystemChangePlugin;
}>;
