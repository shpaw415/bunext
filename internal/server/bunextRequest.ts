import { BunextSession, type SessionData } from "../../features/session/session";
import { webToken } from "@bunpmjs/json-webtoken";
import "./server_global";
import { deleteSessionById, setSessionById } from "../session";
import { generateRandomString } from "../../features/utils";
import { Head, type _Head } from "../../features/head";
import { type FeatureType } from "./server-features";

export class BunextRequest {
  public request: Request;
  public response: Response;
  private _session?: BunextSession<any>;
  public webtoken: webToken<any>;
  public headData?: Record<string, _Head>;
  public path: string = "";
  /**
   * only available when serverConfig.session.type == "database:hard" | "database:memory"
   */
  public SessionID?: string;
  public plugins: FeatureType = {
    globalData: {},
  };
  public global_data: Record<any, any> = {};
  public URL: URL;

  constructor(props: { request: Request; response: Response }) {
    this.request = props.request;
    this.response = props.response;
    this.webtoken = new webToken<any>(this.request, {
      cookieName: "bunext_session_token",
    });
    this.SessionID = (
      this.webtoken.session() as undefined | { id: string }
    )?.id;
    this.URL = new URL(this.request.url);
  }

  /**
   * Lazy getter for session - only creates session when accessed
   */
  public get session(): BunextSession<any> {
    if (!this._session) {
      this._session = new BunextSession({
        sessionTimeout: globalThis?.serverConfig?.session?.timeout,
        request: this as any,
      });
    }
    return this._session;
  }
  public __SET_RESPONSE__(response: Response) {
    this.response = response;
    return this;
  }
  public setHead(data: _Head) {
    this.headData = {
      ...Head.head,
      [this.path]: data,
    };
  }
  public async setCookie(response: Response) {
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

    response.headers.append(
      "session",
      this.encodeSessionData(this.session.getPublicSessionData() || {})
    );
    response.headers.append(
      "__bunext_session_timeout__",
      JSON.stringify(
        this.session.sessionTimeoutFromNow * 1000 + new Date().getTime()
      )
    );

    return this.webtoken.setCookie(response, {
      expire: setExpire(),
      httpOnly: true,
      secure: false,
    });
  }
  public InjectGlobalValues(values: Record<string, any>) {
    for (const [key, val] of Object.entries(values)) {
      try {
        this.plugins.globalData[key] = JSON.stringify(val);
      } catch (error) {
        console.error(`Failed to serialize value for key "${key}":`, error);
      }
    }
  }
  public setGlobalData<key extends string = string, val = any>(
    setter: (current: Record<key, val>) => Record<any, any>
  ) {
    this.global_data = setter(this.global_data);
  }
  encodeSessionData(data: any) {
    return encodeURI(JSON.stringify(data));
  }
}
