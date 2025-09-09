"server only";

import { webToken, type _webToken, type SetDataOptions } from "./webtoken";
import "./server_global";
import type { _GlobalData, ServerConfig } from "internal/types";
import { BunextError } from "./server_global";
import { formatParams, RenderingError, RequestManager, router } from "./router";
import { formatHTML } from "internal/utils";
import { DirectiveTool, type Directives } from "plugins/utils";
import { join, resolve } from "path";
import { pluginLoader } from "./plugin-loader";

export type CookieOptions = _webToken & {
  encrypted?: boolean;
};

export type DeleteCookieOptions = {
  path?: string;
  domain?: string;
  secure?: boolean;
  sameSite?: "Lax" | "Strict" | "None";
  httpOnly?: boolean;
};

const HTML_DOCTYPE = "<!DOCTYPE html>";


class CookieError extends BunextError { }
export class BunextResponseAlreadySetError extends BunextError { }
export class BunextResponseNotSetError extends BunextError { }
export class BunextNoServerSideMatchError extends BunextError { }

const CURRENT_PATH = process.cwd();

export type BunextRequestState = "before_request" | "request" | "after_request";

export type BunextRequestMatch = {
  pathname: string;
  route: string;
  filePaths: { build?: string; src: string };
  params: Record<string, string | string[]> | undefined;
  directive: Directives;
};

export type GlobalDataInjectionType = {
  data: Record<string, string>;
  rawData: Record<string, unknown>;
};

export class BunextRequest<ContextType extends Record<string, unknown> = {}> {
  public request: Request;

  public currentState: BunextRequestState = "before_request";

  private _response?: Response;

  private _response_setted: boolean = false;
  private _response_body: BodyInit | null = null;
  private _response_init?: ResponseInit;

  public manager: RequestManager;
  public path: string = "";

  public isSendNowEnabled: boolean = false;

  public __ERROR__?: Error;

  private _awaitingCookies: Array<{ name: string, data: any, options?: CookieOptions, dataOptions?: SetDataOptions }> = [];
  private _awaitingCookieDeletion: Array<{ name: string, options?: DeleteCookieOptions }> = [];

  private _cookieCache: Map<string, Record<string, unknown>> = new Map();

  /**
   * Indicates if the request is asking for HTML.
   *
   * normally the first HTML load
   */
  public readonly isAskingHTML: boolean;
  /**
   * Indicates if the request is a client-side navigation.
   */
  public readonly isClientNavigating: boolean;
  /**
   * Matching values applied when it is a client-side navigation or a first request to a route.
   */
  public readonly match?: BunextRequestMatch;

  public readonly directivesTools: DirectiveTool;

  /**
   * Indicates if the request is for a static asset.
   *
   * From the Build dir or the Static dir
   */
  public isStaticAsset: boolean = false;


  public globalDataInjection: GlobalDataInjectionType = {
    data: {},
    rawData: {},
  };
  private _prevent_global_values_injection: boolean = false;
  private _prevent_rewrite: boolean = false;
  /**
   * transport Request specific data for plugins
   */
  public context: ContextType = {} as ContextType;
  public URL: URL;

  constructor(props: { request: Request, manager: RequestManager, directivesTools: DirectiveTool }) {
    this.request = props.request;

    this.directivesTools = props.directivesTools;
    this.URL = new URL(this.request.url);
    this.manager = props.manager;

    this.isClientNavigating = this.URL.searchParams.has("__BUNEXT_NAVIGATE__");
    this.isAskingHTML = this.isClientNavigating ? false : Boolean(this.request.headers.get("accept")?.includes("text/html"));
    this.match = this.initMatch();
  }



  private initMatch(): BunextRequestMatch | undefined {
    if (this.isClientNavigating) {
      const pathname = this.URL.searchParams.get("__BUNEXT_PATHNAME__");
      if (!pathname) throw new BunextNoServerSideMatchError(`missing matching information for __BUNEXT_PATHNAME__`);
      const matchServer = this.manager.router.server.match(pathname);
      const matchClient = this.manager.router.client.match(pathname) || process.env.NODE_ENV === "development";
      if (!matchServer || !matchClient) throw new BunextNoServerSideMatchError(`no matching route found for __BUNEXT_PATHNAME__`);


      const directive = this.directivesTools.getDirectiveFromFilePath(matchServer.filePath) as Directives;
      return {
        pathname: matchServer.pathname,
        route: matchServer.name,
        filePaths: {
          build: this.sanitizePath("." + pathname, join(CURRENT_PATH, this.manager.router.buildDir)),
          src: this.sanitizePath("." + pathname, join(CURRENT_PATH, this.manager.router.pageDir)),
        },
        params: formatParams(matchServer.params),
        directive
      };
    } else if (this.isAskingHTML && this.manager.serverSide) {
      const directive = this.directivesTools.getDirectiveFromFilePath(this.manager.serverSide.filePath) as Directives;
      return {
        pathname: this.manager.serverSide.pathname,
        route: this.manager.serverSide.name,
        filePaths: {
          build: this.manager.clientSide?.filePath,
          src: this.manager.serverSide.filePath
        },
        params: formatParams(this.manager.serverSide.params) as Record<string, string | string[]>,
        directive
      };
    } else return undefined;
  }

  private sanitizePath(unsafePath: string, basePath: string) {
    const resolvedPath = resolve(basePath, unsafePath);
    if (!resolvedPath.startsWith(basePath)) {
      throw new Error('Access to path is not allowed.');
    }
    return resolvedPath;
  }

  /**
 * Skip all transformation and other plugins modification and send the response
 */
  sendNow() {
    this._ensureisInState(["request"], "You can only send the response in the request state.");
    this._ensureResponseIsSet("You can only trigger sendNow if the response is set.");
    this.isSendNowEnabled = true;
  }
  /**
   * Gets the context for the request.
   * @returns The context for the request.
   */
  getContext<CutsomContextType extends unknown = undefined>(): CutsomContextType extends undefined ? ContextType : CutsomContextType {
    return this.context as any;
  }
  /**
   * Sets the context data for the request.
   * @param context The context to set for the request. will merge with existing context
   */
  setContext<CutsomContextType extends unknown = undefined>(context: CutsomContextType extends undefined ? ContextType : CutsomContextType) {
    this.context = { ...this.context, ...context as any };
    return context;
  }
  public get response(): Response | undefined {
    return this._response;
  }
  /**
   * Sets the response object. For Plugins.
   * @param response The response object.
   * @returns The current instance for chaining.
   */
  setResponse(body: BodyInit | null, init?: ResponseInit): this {
    this._ensureisInState(["request"], "You can only set the response in the request state.");
    if (this._response_setted) throw new BunextResponseAlreadySetError("Response already set");
    this._response_body = body;
    this._response_init = init;
    this._response_setted = true;
    return this;
  }
  /**
   * Checks if the response has been set.
   * @returns True if the response has been set, false otherwise.
   */
  isResponseSetted(): boolean {
    return this._response_setted;
  }
  unsetResponse(): void {
    this._ensureisInState(["request"], "You can only unset the response in the request state.");
    this._response_setted = false;
    this._response_body = null;
    this._response_init = undefined;
  }

  private _setCookie<T extends Record<string, unknown>>(name: string, data: T, options?: CookieOptions, dataOptions?: SetDataOptions) {
    this._ensureResponseIsSet("error when setting cookie");
    const { encrypted, ...wtOptions } = options || {};
    const wt = new webToken(this.request, wtOptions);
    if (encrypted) {
      wt.setData(data, dataOptions);
      wt.setCookie(this.response as Response);
    } else {
      wt.setPlainJsonCookie(this.response as Response, name, data, wtOptions);
    }
    return this;
  }
  /**
 * Sets a cookie for the response.
 * @param name The name of the cookie.
 * @param data The data to store in the cookie.
 * @param options Options for the cookie.
 */
  setCookie<T extends Record<string, unknown>>(name: string, data: T, options?: CookieOptions, dataOptions?: SetDataOptions) {
    if (this.isResponseSetted()) return this._setCookie(name, data, options, dataOptions);
    this._awaitingCookies.push({ name, data, options, dataOptions });
    return this;
  }
  /**
   * Gets a cookie from the request as an object.
   * @param name The name of the cookie.
   * @param encrypted Whether the cookie is encrypted.
   * @returns The cookie data or undefined if not found.
   */
  getCookie<_Data extends Record<string, unknown>>(name: string, encrypted: boolean = false): _Data | undefined {
    if (this._cookieCache.has(name)) {
      return this._cookieCache.get(name) as _Data;
    }
    const wt = new webToken<_Data>(this.request, { cookieName: name });
    const res = encrypted ? wt.session() : wt.getPlainJsonCookie(name);

    this._cookieCache.set(name, res || {});

    return res;
  }
  private _deleteCookie(name: string, options?: DeleteCookieOptions) {
    this._ensureResponseIsSet("error when deleting cookie");
    const opts = options || {};
    const parts = [`${name}=`, `path=${opts.path || "/"}`];
    if (opts.domain) parts.push(`domain=${opts.domain}`);
    parts.push("expires=Thu, 01 Jan 1970 00:00:00 GMT");
    if (opts.secure) parts.push("secure");
    if (opts.httpOnly) parts.push("httponly");
    parts.push(`samesite=${opts.sameSite || "Lax"}`);
    this.response?.headers.append("Set-Cookie", parts.join("; "));
    return this;
  }
  /**
 * Deletes a cookie from the response.
 * @param name The name of the cookie.
 * @param options Options for deleting the cookie.
 * @returns The current instance for chaining.
 */
  deleteCookie(name: string, options?: DeleteCookieOptions) {
    if (this.isResponseSetted()) return this._deleteCookie(name, options);
    this._awaitingCookieDeletion.push({ name, options });
    return this;
  }
  public _triggerAwaitingCookies() {
    for (const cookie of this._awaitingCookies) {
      this._setCookie(cookie.name, cookie.data, cookie.options, cookie.dataOptions);
    }
    for (const cookie of this._awaitingCookieDeletion) {
      this._deleteCookie(cookie.name, cookie.options);
    }
    this._awaitingCookies = [];
    this._awaitingCookieDeletion = [];
  }
  /**
   * Injects global values into the request. they can be accessed into client-side in the globalThis object.
   * @param values The global values to inject. must be serializable.
   * @example
   * // first declare the global variable
   * declare global {
   *  var __MY_GLOBAL_VALUE__: string | undefined;
   * }
   * // then inject the value
   * req.bunextReq.InjectGlobalValues({ __MY_GLOBAL_VALUE__: "my value" });
   * // then access it in the client-side
   * console.log(globalThis.__MY_GLOBAL_VALUE__); // "my value"
   * @returns The current instance for chaining.
   * @throws Error if the global values injection is not enabled.
   * @throws Error if the value is not serializable.
   * 
   * **Note**: This method can only be used in the `before_request` and `request` plugins.
   * 
   * **Note**: If you want to prevent the injection of global values, you can use the `preventGlobalValuesInjection` method.
   */
  InjectGlobalValues<T extends Partial<typeof globalThis>>(values: T) {
    this._ensureisInState(["before_request", "request"], "Global values injection is only available in the before_request and request states.");
    for (const [key, val] of Object.entries(values)) {
      try {
        this.globalDataInjection.data[key] = typeof val == "undefined" ? "undefined" : JSON.stringify(val);
        this.globalDataInjection.rawData[key] = val;
      } catch (error) {
        console.error(`Failed to serialize value for key "${key}":`, error);
      }
    }
    return this;
  }
  /**
   * Prevent the injection of global values into the request.
   *
   * Prevent unnecessary data exposure, useless server processing or resource corruption.
   * @returns The current instance for chaining.
   */
  preventGlobalValuesInjection() {
    this._prevent_global_values_injection = true;
    return this;
  }
  /**
   * Checks if the global values injection is prevented.
   * @returns True if the global values injection is prevented, false otherwise.
   */
  isGlobalValuesInjectionPrevented() {
    return this._prevent_global_values_injection;
  }
  /**
   * 
   * @returns The current instance for chaining.
   * 
   * Prevent all HTML rewrite plugins from modifying the HTML.
   * 
   * **Note**: This method can only be used in the `before_request` and `request` plugins.
   */
  preventRewrite() {

    this._prevent_rewrite = true;
    return this;
  }
  GlobalValueInjectionIsPrevented() {
    return this._prevent_global_values_injection;
  }
  public async toResponse(): Promise<Response | BunextResponseNotSetError> {
    if (this.__ERROR__) return new BunextError("Error occured during serving", this.__ERROR__);

    try {

      if (!this._response_setted) {
        return new BunextResponseNotSetError("Response not set");
      }

      // Handle string responses with potential HTML processing
      if (typeof this._response_body !== "string") return this.setResponseThenReturn(new Response(this._response_body, this._response_init));


      let formattedStringData: string;

      try {
        formattedStringData = await this.applyModifiers(this._response_body);
      } catch (error) {
        console.error("Failed to apply modifiers:", error);
        formattedStringData = this._response_body; // Fallback to original
      }

      // Initialize response init if not set
      if (!this._response_init) {
        this._response_init = { headers: {} };
      }
      if (!this._response_init.headers) {
        this._response_init.headers = {};
      }

      // Safely handle headers (support both Headers object and plain object)
      const headers = this._response_init.headers instanceof Headers
        ? this._response_init.headers
        : new Headers(this._response_init.headers as HeadersInit);

      const contentType = headers.get("Content-Type") || headers.get("content-type");

      // Apply HTML formatting if content type is HTML
      if (contentType?.includes("text/html")) {
        try {
          formattedStringData = formatHTML(formattedStringData);
        } catch (error) {
          console.warn("Failed to format HTML:", error);
          // Continue without formatting
        }
      } else if (!contentType) {
        // Set default content type for non-HTML string responses
        headers.set("Content-Type", "text/plain");
      }

      // Update headers in response init
      this._response_init.headers = headers;

      // Handle compression if client supports it
      const acceptEncoding = this.manager.request.headers.get("accept-encoding");
      const supportsGzip = acceptEncoding?.includes("gzip") || acceptEncoding?.includes("*");

      if (supportsGzip && formattedStringData.length > 1024) { // Only compress if worth it
        try {
          const compressedData = Bun.gzipSync(formattedStringData);
          headers.set("Content-Encoding", "gzip");
          headers.set("Vary", "Accept-Encoding");

          return this.setResponseThenReturn(new Response(compressedData, this._response_init));
        } catch (error) {
          console.warn("Failed to compress response:", error);
          // Fall back to uncompressed
        }
      }

      return this.setResponseThenReturn(new Response(formattedStringData, this._response_init));
    } catch (error) {
      console.error("Error in toResponse():", error);
      // Return a basic error response instead of throwing
      return this.setResponseThenReturn(new Response("Internal Server Error", {
        status: 500,
        headers: { "Content-Type": "text/plain" }
      }));
    }
  }

  private setResponseThenReturn(res: Response) {
    this._response = res;
    return this._response;
  }

  /**
  * Apply HTML rewrite plugins on html
  * @param html full page html
  * @returns the transformed html ready to set to a Response
  */
  private async applyRewritePlugins(html: string): Promise<string> {
    if (this._prevent_rewrite) return html;
    const rewriter = new HTMLRewriter();
    const plugins = pluginLoader
      .getSubPluginsByParentName("router", "html_rewrite");
    const afters = (await Promise.all(
      plugins.map(async (plugin) => {
        try {
          const context: unknown = plugin.subPlugin.initContext?.(this);
          await plugin.subPlugin.rewrite?.(rewriter, this.manager, context);
          return {
            after: plugin.subPlugin.after,
            context: context,
            name: plugin.name
          };
        } catch (e) {
          console.error(`Error in html_rewrite plugin, name: ${plugin.name}:`, e);
        }
      })
    )).filter((e) => e !== undefined);

    const transformedText = rewriter.transform(html);

    await Promise.all(
      afters.map(({ context, after, name }) => {
        try {
          return after?.(context, this.manager, transformedText)
        } catch (e) {
          console.error(`Error in html_rewrite plugin, name: ${name}:`, e);
        }
      })
    );

    return [HTML_DOCTYPE, transformedText].join("\n");
  }
  private async applyGlobalVariables(html: string): Promise<string> {
    if (this._prevent_global_values_injection) return html;
    const preloadScriptObj = await this.makePreLoadObject();
    const preloadSriptsStrList = [
      ...this.preloadToStringArray(preloadScriptObj),
      "process={env: __PROCESS_ENV__};",
    ].join(";");
    const rewriter = new HTMLRewriter();

    rewriter.on("#_BUNEXT_BOOTSTRAP_SCRIPT_", {
      element(element) {
        element.setInnerContent(preloadSriptsStrList);
      },
    });
    html = rewriter.transform(html);

    return html;
  }
  /**
   * Applies all modifiers to the HTML **rewrite plugins & global variables**
   * @param html The HTML to modify
   * @returns The modified HTML
   */
  private async applyModifiers(html: string): Promise<string> {
    return (await this.applyGlobalVariables(await this.applyRewritePlugins(html)));
  }

  /**
   * Creates the preload object for client-side hydration
   */
  private async makePreLoadObject(): Promise<Partial<Record<keyof _GlobalData, string>>> {
    try {
      return {
        __DEV_ROUTE_PREFETCH__: "[]",
        __PAGES_DIR__: JSON.stringify(router.pageDir),
        __INITIAL_ROUTE__: JSON.stringify(this.manager.serverSide?.pathname + this.manager.search),
        __ROUTES__: router.routes_dump,
        __LAYOUT_ROUTE__: JSON.stringify(router.layoutPaths),
        serverConfig: JSON.stringify({
          Dev: globalThis.serverConfig.Dev,
          HTTPServer: globalThis.serverConfig.HTTPServer,
        } as Partial<ServerConfig>),
        __PROCESS_ENV__: JSON.stringify({
          NODE_ENV: process.env.NODE_ENV,
          ...Object.assign(
            {},
            ...Object.entries(process.env)
              .filter(([key]) => key.startsWith("PUBLIC"))
              .map(([key, value]) => ({ [key]: value }))
          ),
        }),
        ...(this.globalDataInjection.data)
      };
    } catch (error) {
      console.error('Error creating preload object:', error);
      const message = error instanceof Error ? error.message : String(error);
      throw new RenderingError(`Failed to create preload object: ${message}`);
    }
  }
  /**
   * ** **Bunext Internal use only** **
   * 
   * Converts global data to JS format for script injection
   */
  globalDataToJSFormat() {
    return this.preloadToStringArray(this.globalDataInjection.data).join(";");
  }
  /**
   * Converts preload object to string array for script injection
   */
  private preloadToStringArray(
    preload: Partial<Record<keyof _GlobalData & string, string>>
  ): string[] {
    return Object.entries(preload)
      .map(([key, value]) => `globalThis["${key}"]=${value}`)
      .filter(Boolean);
  }
  private _ensureisInState(state: Array<BunextRequestState>, customMessage?: string) {
    if (!state.includes(this.currentState)) {
      throw new Error(`This action is only available in the following states: ${state.join(", ")}. Current state: ${this.currentState}. ${customMessage || ""}`);
    }
  }
  private _ensureResponseIsSet(customMessage?: string) {
    if (!this._response_setted) {
      throw new BunextResponseNotSetError(`Response not set: ${customMessage || ""}`);
    }
  }

  encodeSessionData(data: unknown) {
    return encodeURI(JSON.stringify(data));
  }
}
