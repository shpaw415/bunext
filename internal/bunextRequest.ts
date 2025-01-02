import { _Session, type _SessionData } from "../features/session";
import { webToken } from "@bunpmjs/json-webtoken";
import "./server_global";
import { DeleteSessionByID, SetSessionByID } from "./session";
import { generateRandomString } from "@bunpmjs/bunext/features/utils";

export class BunextRequest {
  public request: Request;
  public response: Response;
  public session: _Session<any>;
  public webtoken: webToken<any>;
  /**
   * only available when serverConfig.session.type == "database:hard" | "database:memory"
   */
  public SessionID?: string;

  constructor(props: { request: Request; response: Response }) {
    this.request = props.request;
    this.response = props.response;
    this.webtoken = new webToken<any>(this.request, {
      cookieName: "bunext_session_token",
    });
    this.session = new _Session({
      sessionTimeout: globalThis.serverConfig.session?.timeout,
      request: this as any,
    });
    this.SessionID = (
      this.webtoken.session() as undefined | { id: string }
    )?.id;
  }
  public __SET_RESPONSE__(response: Response) {
    this.response = response;
    return this;
  }
  public setCookie(response: Response) {
    switch (globalThis.serverConfig.session?.type) {
      case "database:hard":
      case "database:memory":
        const correctID = this.SessionID || generateRandomString(32);
        this.webtoken.setData({
          id: correctID,
        });
        if (this.session.isUpdated) {
          SetSessionByID(
            this.SessionID ? "update" : "insert",
            correctID,
            this.session.__DATA__
          );
        }
        if (this.session.__DELETE__) {
          DeleteSessionByID(correctID);
        }
        break;
      case "cookie":
      case undefined:
        this.webtoken.setData(this.session.__DATA__);
        break;
    }
    if (this.session.__DELETE__) {
      this.webtoken.setData({});
      this.session.reset();
    }
    const setExpire = () => {
      if (this.session.__DELETE__) return -100000;
      return globalThis.serverConfig.session?.timeout || 3600;
    };

    response.headers.append(
      "session",
      this.encodeSessionData(this.session.__DATA__?.public || {})
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
  encodeSessionData(data: any) {
    return encodeURI(JSON.stringify(data));
  }
}
