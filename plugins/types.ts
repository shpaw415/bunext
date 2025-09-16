import type { OnLoadArgs } from "bun";
import type { BunextRequest } from "../internal/server/bunextRequest";
import type { RequestManager } from "../internal/server/router";
import type { ClientIPCManager, DirectiveTool } from "./utils";

/**
 * IPCManager for the main thred
 * used for sending messages between main, cluster and builder threads
 */
type IPCMain = ClientIPCManager<"main">;
/**
 * IPCManager for the cluster thread
 * used for sending messages between main, cluster and builder threads
 */
type IPCCluster = ClientIPCManager<"cluster">;


export type ServerStart = Partial<{
  /**
   * **executed on the main thread**
   */
  main: (ipc: IPCMain) => Promise<any> | any;
  /**
   * executed on dev mode on the main thread
   * 
   * **ONLY DEV MODE**
   * 
   * @param ipc IPC manager for the main thread
   * @returns
   */
  dev_main: (ipc: IPCMain) => Promise<any> | any;
  /**
 * **executed on clusters in multi-threaded mode on the clusters thread**
 * 
 * This will not share the same context as the main thread.
 * 
 * **ONLY IN MULTI-THREADED AND PRODUCTION MODE**
 * 
 * @param ipc IPC manager for the cluster thread
 * @returns
 */
  cluster: (ipc: IPCCluster) => Promise<any> | any;
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




export type Request_Plugin = (
  request: RequestManager,
  ipc: ClientIPCManager<"cluster" | "main">
) => Promise<void> | void;

export type AfterRequest_Plugin = (
  request: RequestManager,
  ipc: ClientIPCManager<"cluster" | "main">
) => Promise<void | Response> | void | Response;

type PartialOverRideResponse = Partial<{
  /**
   * Parsed contents before Bunext processes it for internal features. 
   */
  contents: string;
  /**
   * Loader type for Bun's build process.
   * Refer to Bun's documentation for available loader types.
   */
  loader: Bun.Loader;
}> | undefined;

type Build_Plugins = Partial<{
  plugin: Bun.BunPlugin;
  buildOptions: Partial<Bun.BuildConfig> | (() => Promise<Partial<Bun.BuildConfig>> | Partial<Bun.BuildConfig>);
  /**
   * Add your own custom onLoad handlers for ts and tsx files in the **src/pages** or any subdirectory in process.cwd() directory.
   * 
   * use the fileContent parameter to get the content of the file and modify it to be returned after.
   * 
   * **You must modify the fileContent variable and return it as contents in the response object.**
   * 
   * **Otherwise it will break Plugin chaining**
   * 
   * @example
   *  tsx: (args, fileContent) => {
   *    // modify the fileContent as needed
   *    const modifiedContent = fileContent.replace("oldValue", "newValue");
   *    // OR
   *    const modifiedContent = new Bun.Transpiler({ loader: args.loader, }).transformSync(fileContent);
   *    return { contents: modifiedContent, loader: "js" };
   *  }
   */
  partialPluginOverRide: Partial<{
    /**
     * modify tsx files in the src/pages directory before Bunext processes it for internal features.
     * 
     * **You must modify the fileContent variable and return it as contents in the response object.**
     * 
     * **Otherwise it will break Plugin chaining**
     * 
     * @example
     * tsx: (args, fileContent) => {
   *    // modify the fileContent as needed
   *    const modifiedContent = fileContent.replace("oldValue", "newValue");
   *    // OR
   *    const modifiedContent = new Bun.Transpiler({ loader: args.loader, }).transformSync(fileContent);
   *    return { contents: modifiedContent, loader: "js" };
   *  }
     * @param args 
     * @param fileContent 
     * @param fileDirectives file directives tool instance for testing file directives
     * @returns 
     */
    tsx: (args: OnLoadArgs, fileContent: string, fileDirectives: DirectiveTool) => Promise<PartialOverRideResponse> | PartialOverRideResponse;
    /**
     * modify ts files in the src/pages directory before Bunext processes it for internal features.
     * 
     * **You must modify the fileContent variable and return it as contents in the response object.**
     * 
     * **Otherwise it will break Plugin chaining**
     * 
     * @example
     * tsx: (args, fileContent) => {
   *    // modify the fileContent as needed
   *    const modifiedContent = fileContent.replace("oldValue", "newValue");
   *    // OR
   *    const modifiedContent = new Bun.Transpiler({ loader: args.loader, }).transformSync(fileContent);
   *    return { contents: modifiedContent, loader: "js" };
   *  }
     * @param args 
     * @param fileContent 
     * @param fileDirectives file directives tool instance for testing file directives
     * @returns 
     */
    ts: (args: OnLoadArgs, fileContent: string, fileDirectives: DirectiveTool) => Promise<PartialOverRideResponse> | PartialOverRideResponse;
    /**
     * Other js like files (js, jsx, ts, tsx) somewhere else in project except src/pages directory
     * 
     * **You must modify the fileContent variable and return it as contents in the response object.**
     * 
     * **Otherwise it will break Plugin chaining**
     * 
     * @example
     * others: (args, fileContent, fileDirectives) => {
     *    // modify the fileContent as needed
     *    const modifiedContent = fileContent.replace("oldValue", "newValue");
     *    return { contents: modifiedContent };
     * }
     */
    others: (args: OnLoadArgs, fileContent: string, fileDirectives: DirectiveTool) => Promise<PartialOverRideResponse> | PartialOverRideResponse;
  }>;
  /**
 * Triggered on the **Main Thread** before the build step.
 */
  before_build: (ipc: IPCMain) => Promise<any> | any;
  /**
   * Triggered on the **Main Thread** after the build step and passes every output BuildArtifact for processing.
   */
  after_build: (BuildArtifact: Bun.BuildOutput, ipc: IPCMain) => Promise<any> | any;
}>;

export type PreBuildContextDefaultValues = { route: string };

type buildContextPlugin<T extends Record<string, unknown> = {}> = {
  /**
 * Context values to be passed to the SSR pre-build step.
 *
 * can be accessed in the SSR pre-build process via the usePluginContext hook.
 *
 * this is useful for getting data on pre-build-time if some data are only accessible from the pre-build event.
 * 
 * what is preBuild?
 * @link soon
 *
 * **The context key must be unique**
 * @example { user: { id: 1, name: "John Doe" } }
 * // src/pages/index.tsx
 * const { user } = usePluginContext();
 * user.name = "Jane Doe";
 *
 */
  init_context: () => T | Promise<T>;
  /**
   * After the pre-build process is complete, you can access the modified context.
   */
  after_pre_build: (context: T & PreBuildContextDefaultValues) => Promise<void> | void;
};
type onFileSystemChangePlugin = (
  filePath: string | undefined,
  /**
   * Prevent the build from running
   * 
   * This is useful if you want to prevent the build from running when a file is changed
   */
  preventBuild: () => void,
  ipc: IPCMain
) => void | Promise<void>;

export type BunextPlugin<HTMLRewrite = unknown, PreBuildContext extends Record<string, unknown> = {}> = Required<{
  name: string;
}> & Partial<{

  /**
   * Add Bun.build plugins and build config
   *
   * **Run on the build worker thread**
   */
  build: Build_Plugins;
  /**
   * Pre-build context to be passed to the SSR pre-build step.
   * 
   * Can be accessed in the SSR pre-build process via the usePluginContext hook.
   * 
   * This is useful for getting data on pre-build-time if some data are only accessible from the pre-build event.
   * 
   * **what is preBuild?**
   * @link soon
   */
  pre_build_context: buildContextPlugin<PreBuildContext>;

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
     * @example (manager: RequestManager): Promise<RequestManager> | RequestManager | void | Promise<void> => {
     * // when set via __BYPASS_RESPONSE__ the HTMLRewrite plugins, globalValuesInjection and other request plugin will be skipped
     * // more performant but less flexible
     *  manager.bunextReq.__BYPASS_RESPONSE__ = new Response("Custom response");
     *
     * // global injected value and rewrite plugin will be applied
     * manager.bunextReq.setResponse("Custom response", { headers: { "X-Custom-Header": "value" } });
     *
     * }
     */
    request: Request_Plugin;
    /**
     * Triggered before the request is processed.
     * 
     * Allows context initialization or other pre-processing tasks.
     * 
     * **Do not use this for modifying or setting the response.**
     * @param manager RequestManager
     * @example (manager: RequestManager) => {
     *  manager.bunextReq.setContext({ customValue: "value" });
     *  manager.bunextReq.InjectGlobalValues({ __CUSTOM_GLOBAL__: "value" });
     * }
     */
    before_request: (manager: RequestManager, ipc: ClientIPCManager<"main" | "cluster">) => void | Promise<void>;
    /**
     * Triggered after the request is processed.
     * Allows for modifying the response before it is sent to the client or overriding the current response.
     *
     * if a response is returned this will overwrite the original response
     *
     * @example (manager: RequestManager, ipc: ClientIPCManager<"main" | "cluster">) => {
     *  // Modify response headers and return a new response
     *  const newHeaders = new Headers(response.headers);
     *  newHeaders.set("X-Custom-Header", "value");
     *  return new Response(manager.bunextReq.response.body, { 
     *    status: response.status, 
     *    headers: newHeaders 
     *  });
     * }
     * 
     * @example (manager: RequestManager, ipc: ClientIPCManager<"main" | "cluster">) => {
     * // Add custom headers to the existing response
     *  manager.bunextReq.response.headers.set("X-Custom-Header", "value");
     * }
     */
    after_request: AfterRequest_Plugin
  }>;
  /**
   * Triggered once when the server starts
   * 
   * Initialize resources, connections, or perform startup tasks.
   * 
   * You should create IPC listeners here if needed.
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
   * **Run on the main thread**
   *
   * **ONLY DEV MODE**
   */
  onFileSystemChange: onFileSystemChangePlugin;

  /**
   * 0 has higher priority than 1
   */
  priority?: number;
}>
