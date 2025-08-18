"server only";

import { BunextSession } from "../../features/session/session";
import { webToken, type _webToken } from "./webtoken";
import "./server_global";
import { deleteSessionById, setSessionById } from "../session";
import { generateRandomString } from "../../features/utils";
import { Head, type _Head } from "../../features/head";
import type { _GlobalData, PluginData, ServerConfig } from "internal/types";
import { BunextError } from "./server_global";
import { formatParams, RenderingError, RequestManager, router } from "./router";
import { timeStamp } from "console";
import { formatHTML } from "internal/utils";
import type { DirectiveTool } from "plugins/utils";


export type CookieOptions = _webToken & {
  encrypted?: boolean;
};

const HTML_DOCTYPE = "<!DOCTYPE html>";


class CookieError extends BunextError { }
export class BunextResponseAlreadySetError extends BunextError { }
export class BunextResponseNotSetError extends BunextError { }
export class BunextNoServerSideMatchError extends BunextError { }

export class BunextRequest<ContextType extends Record<string, unknown> = {}> {
  public request: Request;
  private _response: Response;
  private _response_setted: boolean = false;
  private _response_body: BodyInit | null = null;
  private _response_init?: ResponseInit;
  private _session?: BunextSession<any>;
  public manager: RequestManager;
  public webtoken: webToken<any>;
  public headData?: Record<string, _Head>;
  public path: string = "";
  public __BYPASS_RESPONSE__: Response | undefined;
  private readonly __REQUEST_PARAMS__: Record<string, string | string[]> | undefined;
  private readonly __REQUEST_NAVIGATE__: boolean;
  public readonly isAskingHTML: boolean;
  /**
   * only available when serverConfig.session.type == "database:hard" | "database:memory"
   */
  public SessionID?: string;
  public plugins: PluginData = {
    globalData: {},
    rawGlobalData: {},
  };
  private _prevent_global_values_injection: boolean = false;
  private _prevent_rewrite: boolean = false;
  /**
   * transport Request specific data for plugins
   */
  public context: ContextType = {} as ContextType;
  public URL: URL;

  constructor(props: { request: Request; response: Response, manager: RequestManager, directivesTools: DirectiveTool }) {
    this.request = props.request;
    this._response = props.response;
    this.webtoken = new webToken<any>(this.request, {
      cookieName: "bunext_session_token"
    });
    this.SessionID = (
      this.webtoken.session() as undefined | { id: string }
    )?.id;
    this.URL = new URL(this.request.url);
    this.manager = props.manager;

    const bunext_params = this.URL.searchParams.get("__BUNEXT_PARAMS__");
    this.__REQUEST_PARAMS__ = bunext_params ? JSON.parse(decodeURI(bunext_params)) : formatParams(this.manager?.serverSide?.params);
    this.__REQUEST_NAVIGATE__ = this.URL.searchParams.has("__BUNEXT_NAVIGATE__");
    this.isAskingHTML = this.__REQUEST_NAVIGATE__ ? false : Boolean(this.request.headers.get("accept")?.includes("text/html"));
  }
  /**
   * Gets the context for the request.
   * @returns The context for the request.
   */
  public getContext<CutsomContextType extends unknown = undefined>(): CutsomContextType extends undefined ? ContextType : CutsomContextType {
    return this.context as any;
  }
  /**
   * Sets the context for the request.
   * @param context The context to set for the request. will merge with existing context
   */
  public setContext(context: Partial<ContextType>) {
    this.context = { ...this.context, ...context };
  }
  /**
   * Gets the request parameters same as RouteMatch.params
   * @returns The request parameters.
   */
  public getRequestParams<T extends Record<string, unknown> = {}>() {
    return this.__REQUEST_PARAMS__ as T;
  }
  /**
   * Checks if the request is a client-side navigation.
   * @returns True if the request is a client-side navigation, false otherwise.
   */
  public isClientNavigation() {
    return this.__REQUEST_NAVIGATE__;
  }

  /**
   * Lazy getter for session - only creates session when accessed
   */
  public get session(): BunextSession<any> {
    if (!this._session) {
      this._session = new BunextSession({
        sessionTimeout: globalThis?.serverConfig?.session?.timeout,
        request: this,
      });
    }
    return this._session;
  }
  public get response(): Response {
    return this._response;
  }
  /**
   * Sets the response object. For Plugins.
   * @param response The response object.
   * @returns The current instance for chaining.
   */
  public setResponse(body: BodyInit | null, init?: ResponseInit): void | BunextResponseAlreadySetError {
    if (this._response_setted) return new BunextResponseAlreadySetError("Response already set");
    this._response_body = body;
    this._response_init = init;
    this._response_setted = true;
  }
  public isResponseSetted(): boolean {
    return this._response_setted || Boolean(this.__BYPASS_RESPONSE__);
  }
  public unsetResponse(): void {
    this._response_setted = false;
    this._response_body = null;
    this._response_init = undefined;
  }
  public setHead(data: _Head) {
    this.headData = {
      ...Head.head,
      [this.manager.pathname]: data,
    };
  }
  /**
   * <strong>DO NOT USE. BUNEXT INTERNAL USE ONLY</strong>
   * set the session cookie
   */
  public async setSessionCookie(response: Response) {
    switch (globalThis.serverConfig.session?.type) {
      case "database:hard":
      case "database:memory":
        const correctID = this.SessionID || generateRandomString(32);
        this.webtoken.setData({
          id: correctID,
        });
        if (this.session.isSessionUpdated()) {
          await setSessionById(
            this.SessionID ? "update" : "insert",
            correctID,
            this.session.getRawSessionData()
          );
        }
        if (this.session.isSessionDeleted()) {
          await deleteSessionById(correctID);
        }
        break;
      case "cookie":
      case undefined:
        this.webtoken.setData(this.session.getRawSessionData());
        break;
    }
    if (this.session.isSessionDeleted()) {
      this.webtoken.setData({});
      this.session.reset();
    }
    const setExpire = () => {
      if (this.session.isSessionDeleted()) return -100000;
      return (
        this.session?.session_expiration_override ??
        globalThis.serverConfig.session?.timeout ??
        3600
      );
    };

    (response || this.response).headers.append(
      "session",
      this.encodeSessionData(this.session.getPublicSessionData() || {})
    );
    (response || this.response).headers.append(
      "__bunext_session_timeout__",
      JSON.stringify(
        this.session.sessionTimeoutFromNow * 1000 + new Date().getTime()
      )
    );

    return this.webtoken.setCookie(response || this.response, {
      maxAge: setExpire(),
      httpOnly: true,
      secure: false,
    });
  }
  /**
   * Sets a cookie for the response.
   * @param name The name of the cookie.
   * @param data The data to store in the cookie.
   * @param options Options for the cookie.
   */
  public setCookie<T extends Record<string, unknown>>(name: string, data: T, options?: CookieOptions) {
    const wt = new webToken(this.request, {
      cookieName: name
    });
    if (options?.encrypted) {
      wt.setData(data);
      //wt.setCookie(this.response);
    } else {
      wt.setPlainJsonCookie(this.response, name, data, options);
    }
    return this;
  }
  /**
   * Gets a cookie from the request.
   * @param name The name of the cookie.
   * @param encrypted Whether the cookie is encrypted.
   * @returns The cookie data or undefined if not found.
   */
  public getCookie<_Data extends Record<string, unknown>>(name: string, encrypted: boolean = false): _Data | undefined {
    const wt = new webToken<_Data>(this.request, { cookieName: name });
    return encrypted ? wt.session() : wt.getPlainJsonCookie(name);
  }
  /**
   * Injects global values into the request. they can be accessed into client-side in the globalThis object.
   * @param values The global values to inject. must be serializable.
   */
  public InjectGlobalValues(values: Record<string, unknown>) {
    for (const [key, val] of Object.entries(values)) {
      try {
        this.plugins.globalData[key] = typeof val == "undefined" ? "undefined" : JSON.stringify(val);
        this.plugins.rawGlobalData[key] = val;
      } catch (error) {
        console.error(`Failed to serialize value for key "${key}":`, error);
      }
    }
    return this;
  }
  public preventGlobalValuesInjection() {
    this._prevent_global_values_injection = true;
    return this;
  }
  public preventRewrite() {
    this._prevent_rewrite = true;
    return this;
  }
  public GlobalValueInjectionIsPrevented() {
    return this._prevent_global_values_injection;
  }
  public async toResponse(): Promise<Response | BunextResponseNotSetError> {
    try {
      // Return bypass response if set
      if (this.__BYPASS_RESPONSE__) return this.__BYPASS_RESPONSE__;

      if (!this._response_setted) {
        return new BunextResponseNotSetError("Response not set");
      }

      // Handle string responses with potential HTML processing
      if (typeof this._response_body === "string") {
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

            return new Response(compressedData, this._response_init);
          } catch (error) {
            console.warn("Failed to compress response:", error);
            // Fall back to uncompressed
          }
        }

        return new Response(formattedStringData, this._response_init);
      }

      // Handle non-string responses (buffers, streams, etc.)
      return new Response(this._response_body, this._response_init);

    } catch (error) {
      console.error("Error in toResponse():", error);
      // Return a basic error response instead of throwing
      return new Response("Internal Server Error", {
        status: 500,
        headers: { "Content-Type": "text/plain" }
      });
    }
  }

  /**
  * Apply HTML rewrite plugins on html
  * @param html full page html
  * @returns the transformed html ready to set to a Response
  */
  private async applyRewritePlugins(html: string): Promise<string> {
    if (this._prevent_rewrite) return html;
    const rewriter = new HTMLRewriter();
    const plugins = router
      .getSubPluginsByParentName("router", "html_rewrite");
    const afters = await Promise.all(
      plugins.map(async (plugin) => {
        const context: unknown = plugin.initContext?.(this);
        await plugin.rewrite?.(rewriter, this.manager, context);
        return {
          after: plugin.after,
          context: context,
        };
      })
    );

    const transformedText = rewriter.transform(html);

    await Promise.all(
      afters.map(({ context, after }) => after?.(context, this.manager, transformedText))
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
      if (this.headData) {
        Object.entries(this.headData).forEach(([path, data]) => {
          Head.setHead({
            path,
            data
          });
        });
      }

      return {
        __DEV_ROUTE_PREFETCH__: "[]",
        __PAGES_DIR__: JSON.stringify(router.pageDir),
        __INITIAL_ROUTE__: JSON.stringify(this.manager.serverSide?.pathname + this.manager.search),
        __ROUTES__: router.routes_dump,
        __LAYOUT_ROUTE__: JSON.stringify(router.layoutPaths),
        __HEAD_DATA__: JSON.stringify({ ...Head.head }),
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
        ...(this.plugins.globalData)
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
    return this.preloadToStringArray(this.plugins.globalData).join(";");
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

  encodeSessionData(data: unknown) {
    return encodeURI(JSON.stringify(data));
  }
}
